/**
 * Lesson plan routes for Wrestling Coach
 */

const { queries } = require('../db');
const { formatVideo } = require('./videos');
const { Router } = require('express');
const router = Router();

// Get all lesson plans
router.get('/lesson-plans', async (req, res) => {
  const isTemplate = req.query.is_template === 'true';
  
  try {
    const plans = await queries.getAllPlans(isTemplate);
    
    const plansWithVideos = await Promise.all(plans.map(async plan => {
      const videos = await queries.getPlanVideos(plan.id);
      return { ...plan, videos };
    }));
    
    res.json(plansWithVideos);
  } catch (e) {
    console.error('Error loading plans:', e);
    res.status(500).json({ error: 'Failed to load plans' });
  }
});

// Get single lesson plan
router.get('/lesson-plans/:id', async (req, res) => {
  try {
    const plan = await queries.getPlanById(parseInt(req.params.id));
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    
    const videos = await queries.getPlanVideos(plan.id);
    res.json({ ...plan, videos });
  } catch (e) {
    console.error('Error loading plan:', e);
    res.status(500).json({ error: 'Failed to load plan' });
  }
});

// Create lesson plan
router.post('/lesson-plans', async (req, res) => {
  const { name, description, difficulty, category, age_group, notes, videos, is_template, style } = req.body;
  
  try {
    const result = await queries.createPlan({
      name, description, difficulty, category, age_group, notes, is_template, style
    });
    
    const planId = result.lastInsertRowid;
    
    if (videos && videos.length) {
      for (const [index, video] of videos.entries()) {
        await queries.addVideoToPlan(planId, video.id || video.video_id, index, video.notes);
      }
    }
    
    res.json({ success: true, planId, name });
  } catch (e) {
    console.error('Error creating plan:', e);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

// Update lesson plan
router.post('/lesson-plans/:id', async (req, res) => {
  const { name, description, difficulty, category, age_group, notes, is_template } = req.body;
  
  try {
    await queries.updatePlan(parseInt(req.params.id), {
      name, description, difficulty, category, age_group, notes, is_template
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Error updating plan:', e);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

// Delete lesson plan
router.delete('/lesson-plans/:id', async (req, res) => {
  try {
    await queries.deletePlan(parseInt(req.params.id));
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting plan:', e);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

// Add video to plan
router.post('/plan-videos/:planId/add', async (req, res) => {
  const { videoId, notes } = req.body;
  
  try {
    const maxOrder = await queries.getMaxOrder(parseInt(req.params.planId));
    const newOrder = (maxOrder?.max || -1) + 1;
    
    await queries.addVideoToPlan(parseInt(req.params.planId), videoId, newOrder, notes);
    res.json({ success: true, newOrder });
  } catch (e) {
    console.error('Error adding video:', e);
    res.status(500).json({ error: 'Failed to add video' });
  }
});

// Reorder videos in plan
router.post('/plan-videos/:planId/reorder', (req, res) => {
  // Simplified - just acknowledge
  res.json({ success: true });
});

module.exports = { router };
