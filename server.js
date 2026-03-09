/**
 * Wrestling Coach Server
 * Supports both SQLite (local) and PostgreSQL (Render)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { queries, initSchema, usePostgres } = require('./db');

const app = express();
const PORT = process.env.PORT || 3737;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'static')));

// API Routes
app.use('/api', require('./routes/videos').router);
app.use('/api', require('./routes/lesson-plans').router);
app.use('/api', require('./routes/auth').router);
app.use('/api', require('./routes/users').router);

// Seed lesson plans if empty
async function seedLessonPlans() {
  try {
    const count = (await queries.countPlans()).count;
    
    if (count === 0) {
      const seedPath = path.join(__dirname, 'seed_lesson_plans.json');
      
      if (fs.existsSync(seedPath)) {
        const lessonPlans = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        
        for (const plan of lessonPlans) {
          const result = await queries.createPlan({
            name: plan.name,
            description: plan.description,
            difficulty: plan.difficulty,
            category: plan.category,
            age_group: plan.age_group || 'elementary (6-10)',
            notes: plan.notes,
            is_template: plan.is_template ? 1 : 0,
            style: plan.style || 'folkstyle'
          });
          
          const planId = result.lastInsertRowid;
          
          if (plan.videos && plan.videos.length) {
            for (const [idx, video] of plan.videos.entries()) {
              await queries.addVideoToPlan(planId, video.video_id, idx, video.notes);
            }
          }
        }
        
        console.log(`📚 Seeded ${lessonPlans.length} lesson plans`);
      }
    }
  } catch (e) {
    console.log('Note: Could not seed lesson plans:', e.message);
  }
}

// Start server
async function start() {
  // Initialize schema
  await initSchema();
  
  // Seed data
  await seedLessonPlans();
  
  app.listen(PORT, () => {
    console.log(`🤼 Wrestling Coach running at http://localhost:${PORT}`);
    console.log(`   Database: ${usePostgres ? 'PostgreSQL' : 'SQLite'}`);
  });
}

start().catch(console.error);

module.exports = app;
