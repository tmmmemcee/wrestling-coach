/**
 * Wrestling Coach Server
 * Clean, modular Express server
 */

const express = require('express');
const path = require('path');
const { db, planQueries } = require('./db');

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

// Seed lesson plans if empty (on startup)
function seedLessonPlans() {
  const count = planQueries.count.get().count;
  
  if (count === 0) {
    try {
      const seedPath = path.join(__dirname, 'seed_lesson_plans.json');
      const fs = require('fs');
      
      if (fs.existsSync(seedPath)) {
        const lessonPlans = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        
        for (const plan of lessonPlans) {
          const result = planQueries.create.run(
            plan.name,
            plan.description,
            plan.difficulty,
            plan.category,
            plan.age_group || 'elementary (6-10)',
            plan.notes,
            plan.is_template ? 1 : 0,
            plan.style || 'folkstyle'
          );
          
          const planId = result.lastInsertRowid;
          
          if (plan.videos && plan.videos.length) {
            for (const [idx, video] of plan.videos.entries()) {
              planQueries.addVideo.run(planId, video.video_id, idx, video.notes);
            }
          }
        }
        
        console.log(`📚 Seeded ${lessonPlans.length} lesson plans`);
      }
    } catch (e) {
      console.log('Note: Could not seed lesson plans:', e.message);
    }
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`🤼 Wrestling Coach running at http://localhost:${PORT}`);
  seedLessonPlans();
});

module.exports = app;
