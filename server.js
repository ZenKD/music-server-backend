require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');

const app = express();
app.use(express.json());
app.use(cors());

// 1. Cloudflare R2 Configuration
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// 2. Upload Middleware (Multer + S3)
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.R2_BUCKET_NAME,
    acl: 'public-read', // Helps with access permissions
    contentType: multerS3.AUTO_CONTENT_TYPE, // Automatically sets audio/mpeg
    key: function (req, file, cb) {
      // Use the original filename but add a timestamp to make it unique
      cb(null, Date.now().toString() + '-' + file.originalname);
    }
  })
});

// 3. Database & Schema
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ DB Error:", err));

const songSchema = new mongoose.Schema({
  title: String,
  artist: String,
  songUrl: String,
});
const Song = mongoose.model('Song', songSchema);

// 4. Routes

// GET: List all songs
app.get('/songs', async (req, res) => {
  const songs = await Song.find();
  res.json(songs);
});

// POST: Upload a Song
// 'audioFile' must match the name in the frontend form
app.post('/upload', upload.single('audioFile'), async (req, res) => {
  try {
    const { title, artist } = req.body;
    
    // Construct the public URL manually
    // CHANGE THIS URL to your actual public R2 domain from Phase 1
    const publicDomain = "https://pub-71abb8b18eb748488766471d0f373860.r2.dev"; 
    const fileUrl = `${publicDomain}/${req.file.key}`;

    const newSong = new Song({
      title,
      artist,
      songUrl: fileUrl
    });

    await newSong.save();
    res.status(201).json(newSong);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));