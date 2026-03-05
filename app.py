from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
import re

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///wrestling_videos.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class Video(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    youtube_id = db.Column(db.String(20), unique=True, nullable=False)
    title = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text)
    channel = db.Column(db.String(200))
    duration = db.Column(db.Integer)  # seconds
    views = db.Column(db.Integer)
    thumbnail_url = db.Column(db.String(500))
    
    # Wrestling metadata
    move_type = db.Column(db.String(100))  # single leg, double leg, etc.
    position = db.Column(db.String(50))  # neutral, top, bottom
    difficulty = db.Column(db.String(50))  # beginner, intermediate, advanced
    age_group = db.Column(db.String(50))  # elementary, middle school
    style = db.Column(db.String(50))  # folkstyle, freestyle, greco
    
    # Source tracking
    source_type = db.Column(db.String(50))  # youtube, flow, rudis
    coach_name = db.Column(db.String(200))
    
    # Search tags (comma separated)
    tags = db.Column(db.Text)
    
    # Tracking
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    indexed_at = db.Column(db.DateTime)
    
    def to_dict(self):
        return {
            'id': self.id,
            'youtube_id': self.youtube_id,
            'title': self.title,
            'description': self.description,
            'channel': self.channel,
            'duration_formatted': self.format_duration(),
            'thumbnail_url': self.thumbnail_url,
            'move_type': self.move_type,
            'position': self.position,
            'difficulty': self.difficulty,
            'age_group': self.age_group,
            'style': self.style,
            'coach_name': self.coach_name,
            'tags': self.tags
        }
    
    def format_duration(self):
        if not self.duration:
            return None
        minutes = self.duration // 60
        seconds = self.duration % 60
        return f"{minutes}:{seconds:02d}"

    def get_embed_url(self):
        return f"https://www.youtube.com/embed/{self.youtube_id}"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search')
def search():
    query = request.args.get('q', '')
    move_type = request.args.get('move_type', '')
    position = request.args.get('position', '')
    difficulty = request.args.get('difficulty', '')
    age_group = request.args.get('age_group', '')
    
    # Build query
    q = Video.query
    
    if query:
        # Search in title, description, tags, move_type
        search_filter = db.or_(
            Video.title.contains(query),
            Video.description.contains(query),
            Video.tags.contains(query),
            Video.move_type.contains(query),
            Video.coach_name.contains(query)
        )
        q = q.filter(search_filter)
    
    if move_type:
        q = q.filter(Video.move_type == move_type)
    if position:
        q = q.filter(Video.position == position)
    if difficulty:
        q = q.filter(Video.difficulty == difficulty)
    if age_group:
        q = q.filter(Video.age_group == age_group)
    
    # Order by most recent indexed
    videos = q.order_by(Video.indexed_at.desc()).limit(50).all()
    
    return jsonify([v.to_dict() for v in videos])

@app.route('/video/<int:video_id>')
def video_detail(video_id):
    video = Video.query.get_or_404(video_id)
    return render_template('video.html', video=video)

@app.route('/admin')
def admin():
    stats = {
        'total_videos': Video.query.count(),
        'by_move_type': db.session.query(Video.move_type, db.func.count(Video.id)).group_by(Video.move_type).all(),
        'by_position': db.session.query(Video.position, db.func.count(Video.id)).group_by(Video.position).all(),
        'by_difficulty': db.session.query(Video.difficulty, db.func.count(Video.id)).group_by(Video.difficulty).all()
    }
    return render_template('admin.html', stats=stats)

@app.route('/filters')
def get_filters():
    """Return all available filter options"""
    return jsonify({
        'move_types': [r[0] for r in db.session.query(Video.move_type).distinct().all() if r[0]],
        'positions': [r[0] for r in db.session.query(Video.position).distinct().all() if r[0]],
        'difficulties': ['beginner', 'intermediate', 'advanced'],
        'age_groups': ['elementary (6-10)', 'middle school (11-14)']
    })

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)
