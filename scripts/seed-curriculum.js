// Script to populate lesson plans for 3-week youth wrestling curriculum
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'wrestling.db'));

// Create tables if they don't exist
db.exec(`CREATE TABLE IF NOT EXISTS lesson_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  difficulty TEXT DEFAULT 'beginner',
  category TEXT,
  age_group TEXT DEFAULT 'elementary (6-10)',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_template INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS plan_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_plan_id INTEGER NOT NULL,
  video_id INTEGER NOT NULL,
  order_num INTEGER NOT NULL,
  notes TEXT,
  FOREIGN KEY (lesson_plan_id) REFERENCES lesson_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
)`);

const curriculum = [
  // WEEK 1: FOUNDATIONS
  {
    name: "Week 1, Lesson 1: Stance, Motion & Balance",
    description: "Establish proper wrestling stance and movement fundamentals",
    difficulty: "beginner",
    category: "fundamentals",
    notes: "Core foundation - practice in front of mirror. Feet shoulder-width apart, knees bent, back straight, hands up. Each drill: 3 sets of 30 seconds.",
    videos: [
      { id: 26, notes: "Wrestling Stance For Beginners - Core foundation" },
      { id: 126, notes: "The Essentials of a Wrestling Stance - Focus on feet position" },
      { id: 128, notes: "Stance and Motion Drills - Practice 3 sets of 30 seconds" },
      { id: 127, notes: "Practice Proper Wrestling Stance and Motion - Common mistakes" }
    ]
  },
  {
    name: "Week 1, Lesson 2: Level Change & Penetration Step",
    description: "Learn the fundamental shooting motion for all takedowns",
    difficulty: "beginner",
    category: "fundamentals",
    notes: "Level change = bend knees, not waist. Penetration step should be explosive. Keep head up. Practice 10 reps each side.",
    videos: [
      { id: 130, notes: "Level Change - What NOT to do first" },
      { id: 29, notes: "Penetration Step by Adam Wheeler - #1 most important skill" },
      { id: 131, notes: "Split Step Level Change - Cary Kolat timing details" },
      { id: 134, notes: "Penetration Step Power Leg - Focus on power leg" }
    ]
  },
  {
    name: "Week 1, Lesson 3: Hand Fighting & Ties",
    description: "Learn to control ties and create scoring opportunities",
    difficulty: "beginner",
    category: "fundamentals",
    notes: "Control the inside position. Keep elbows tight. Use head as a weapon. Create angles for shots.",
    videos: [
      { id: 33, notes: "Hand Fighting Blueprint - Core concepts" },
      { id: 136, notes: "Hand Fighting Head Control - Cary Kolat - Head = control" },
      { id: 142, notes: "Jordan Burroughs Hand Fighting Mastery - Learn timing from the best" }
    ]
  },
  
  // WEEK 2: TAKEDOWNS & DEFENSE
  {
    name: "Week 2, Lesson 4: Single Leg Takedown",
    description: "Master the most fundamental takedown in wrestling",
    difficulty: "beginner",
    category: "takedowns",
    notes: "Penetration step to outside. Grab behind the knee. Put head on inside. Drive through the leg. Drill 20 reps each side.",
    videos: [
      { id: 2, notes: "Perfect Single Leg for Beginners - Best beginner breakdown" },
      { id: 66, notes: "5 Minutes of Pure Single Leg Technique - Watch different finishes" },
      { id: 116, notes: "Single Leg Defense - Whizzer basics - Learn defense too" }
    ]
  },
  {
    name: "Week 2, Lesson 5: Double Leg Takedown",
    description: "Learn wrestling's most explosive takedown",
    difficulty: "beginner",
    category: "takedowns",
    notes: "Change level BEFORE shooting. Head to the side, not chest. Grab behind both knees. Drive and lift. Drill 15 reps each side.",
    videos: [
      { id: 4, notes: "Double Leg Take Down Basics - Simple, clear instruction" },
      { id: 68, notes: "Double Leg Youth Wrestling Technique - Specifically for youth" },
      { id: 135, notes: "Penetration Step & Level Change - Combines all Week 1-2 skills" }
    ]
  },
  {
    name: "Week 2, Lesson 6: Sprawling & Takedown Defense",
    description: "Learn to stop shots and create counter opportunities",
    difficulty: "beginner",
    category: "defense",
    notes: "Hips DOWN when opponent shoots. Hands on shoulders. Spin behind for 2 points. Never get flattened. Drill sprawls: 3 sets of 10.",
    videos: [
      { id: 21, notes: "Sprawl by Ben Askren - Best sprawl instruction" },
      { id: 114, notes: "Wrestling Sprawl Secrets - John Smith's legendary defense" },
      { id: 20, notes: "Best Sprawl Position - Cary Kolat hip positioning" }
    ]
  },
  
  // WEEK 3: GROUND WRESTLING
  {
    name: "Week 3, Lesson 7: Stand-Up Escape",
    description: "Master the most important escape from bottom position",
    difficulty: "beginner",
    category: "escapes",
    notes: "Create space first. Stand up in one motion. Hand control is key. Don't get pulled back down. Drill 15 reps each side.",
    videos: [
      { id: 95, notes: "Stand Up Escape Basics - Foundation of all escapes" },
      { id: 18, notes: "How To Get Away From Everyone - David Carr NCAA champion" },
      { id: 94, notes: "Why Beginners Get Stuck on Bottom - Common mistakes" }
    ]
  },
  {
    name: "Week 3, Lesson 8: Sit-Out & Switch",
    description: "Learn alternative escapes when stand-up isn't available",
    difficulty: "beginner",
    category: "escapes",
    notes: "Sit-out when opponent rides high. Turn in to face opponent. Switch when opponent reaches. Always be moving on bottom.",
    videos: [
      { id: 98, notes: "Sit Out, Turn In, Back Door - Multiple escape options" },
      { id: 105, notes: "Sit Out Hip Heist Recovery - Cary Kolat hip movement" },
      { id: 107, notes: "Wrestling Reversals: The Switch - Classic reversal technique" }
    ]
  },
  {
    name: "Week 3, Lesson 9: Half Nelson Pin",
    description: "Learn wrestling's most basic and effective pinning combination",
    difficulty: "beginner",
    category: "pins",
    notes: "Control the wrist first. Slide arm under arm. Apply pressure with forearm. Walk toward opponent's head. Drill 20 reps.",
    videos: [
      { id: 13, notes: "Youth Wrestling Half Nelson Pin - Specifically for youth" },
      { id: 14, notes: "Half Nelson Tutorial Youth Wrestling - Step-by-step breakdown" },
      { id: 143, notes: "Half Nelson Tutorial Wrestling Fundamentals - Common variations" }
    ]
  }
];

// Clear existing lesson plans
console.log("Clearing existing lesson plans...");
db.exec("DELETE FROM plan_videos");
db.exec("DELETE FROM lesson_plans");

// Insert new lesson plans
console.log("Adding 9 lesson plans...");

const insertPlan = db.prepare(`
  INSERT INTO lesson_plans (name, description, difficulty, category, age_group, notes, is_template)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`);

const insertVideo = db.prepare(`
  INSERT INTO plan_videos (lesson_plan_id, video_id, order_num, notes)
  VALUES (?, ?, ?, ?)
`);

for (const lesson of curriculum) {
  const result = insertPlan.run(
    lesson.name,
    lesson.description,
    lesson.difficulty,
    lesson.category,
    'elementary (6-10)',
    lesson.notes
  );
  
  const planId = result.lastInsertRowid;
  
  for (const [index, video] of lesson.videos.entries()) {
    insertVideo.run(planId, video.id, index, video.notes);
  }
  
  console.log(`✓ Added: ${lesson.name}`);
}

// Verify
const count = db.prepare("SELECT COUNT(*) as count FROM lesson_plans").get();
console.log(`\n✅ Done! Created ${count.count} lesson plans.`);
console.log("All plans saved as templates for reuse.");

db.close();
