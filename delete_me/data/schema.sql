CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  published INTEGER DEFAULT 0,
  author_id INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id),
  post_id INTEGER NOT NULL REFERENCES posts(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER REFERENCES posts(id),
  tag_id INTEGER REFERENCES tags(id),
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_published ON posts(published);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_post ON comments(post_id);

-- Seed data
INSERT INTO users (email, name, password, role) VALUES
  ('admin@example.com', 'Admin User', 'hashed_pw_1', 'admin'),
  ('alice@example.com', 'Alice Smith', 'hashed_pw_2', 'user'),
  ('bob@example.com', 'Bob Jones', 'hashed_pw_3', 'user');

INSERT INTO posts (title, content, published, author_id) VALUES
  ('Hello World', 'This is the first post', 1, 1),
  ('Draft Post', 'Work in progress...', 0, 2),
  ('TypeScript Tips', 'Use strict mode always', 1, 2);

INSERT INTO comments (content, author_id, post_id) VALUES
  ('Great post!', 2, 1),
  ('Thanks for sharing', 3, 1),
  ('Needs more detail', 1, 3);

INSERT INTO tags (name) VALUES ('typescript'), ('tutorial'), ('announcement');
INSERT INTO post_tags (post_id, tag_id) VALUES (1, 3), (3, 1), (3, 2);
