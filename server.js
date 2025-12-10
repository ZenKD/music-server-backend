require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// 1. Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// 2. Define the "Song" Schema
// This tells the DB what a song looks like
const songSchema = new mongoose.Schema({
  title: String,
  artist: String,
  songUrl: String, // The Cloudflare R2 link
});

const Song = mongoose.model('Song', songSchema);

// 3. API Routes

// GET: Fetch all songs for the frontend
app.get('/songs', async (req, res) => {
  try {
    const songs = await Song.find();
    res.json(songs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Add a new song to the database
app.post('/songs', async (req, res) => {
  try {
    const { title, artist, songUrl } = req.body;
    const newSong = new Song({ title, artist, songUrl });
    await newSong.save();
    res.status(201).json(newSong);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Start the Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));