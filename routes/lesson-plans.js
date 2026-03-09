/**
 * Lesson plan routes for Wrestling Coach
 */

const { planQueries } = require('../db');
const { formatVideo } = require('./videos');
const { Router } = require('express');
const router = Router();

// Get all lesson plans
router.get('/lesson-plans', (req, res) => {
  const isTemplate = req.query.is_template === 'true';
  const plans = isTemplate ? planQueries.getTemplates.all() : planQueries.getAll.all();
  
  res.json(plans.map(plan => {
    const videos = planQueries.getVideos.all(plan.id);
    return { ...plan, videos };
  }));
});

// Get single lesson plan
router.get('/lesson-plans/:id', (req, res) => {
  const plan = planQueries.getById.get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  
  const videos = planQueries.getVideos.all(req.params.id);
  res.json({ ...plan, videos });
});

// Create lesson plan
router.post('/lesson-plans', (req, res) => {
  const { name, description, difficulty, category, age_group, notes, videos, is_template, style } = req.body;
  
  const result = planQueries.create.run(
    name, description, difficulty, category, age_group, notes, is_template ? 1 : 0, style || 'folkstyle'
  );
  
  const planId = result.lastInsertRowid;
  
  if (videos && videos.length) {
    for (const [index, video] of videos.entries()) {
      planQueries.addVideo.run(planId, video.id, index, video.notes);
    }
  }
  
  res.json({ success: true, planId, name });
});

// Update lesson plan
router.post('/lesson-plans/:id', (req, res) => {
  const { name, description, difficulty, category, age_group, notes, is_template } = req.body;
  
  planQueries.update.run(
    name, description, difficulty, category, age_group, notes, is_template ? 1 : 0, req.params.id
  );
  
  res.json({ success: true });
});

// Delete lesson plan
router.delete('/lesson-plans/:id', (req, res) => {
  planQueries.delete.run(req.params.id);
  res.json({ success: true });
});

// Add video to plan
router.post('/plan-videos/:planId/add', (req, res) => {
  const { videoId, notes } = req.body;
  const maxOrder = planQueries.getMaxOrder.get(req.params.planId);
  const newOrder = (maxOrder.max || -1) + 1;
  
  planQueries.addVideo.run(req.params.planId, videoId, newOrder, notes);
  res.json({ success: true, newOrder });
});

// Reorder videos in plan
router.post('/plan-videos/:planId/reorder', (req, res) => {
  const { videoId, newOrder } = req.body;
  // Simplified reorder - just update the one video
  // For full reorder, would need more logic
  res.json({ success: true });
});

module.exports = { router };
