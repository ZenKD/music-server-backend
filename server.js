require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ DB Error:", err));

// 2. Define Schemas
const SongSchema = new mongoose.Schema({
  title: String,
  artist: String,
  songUrl: String,
  r2Key: { type: String, unique: true }
});

const PlaylistSchema = new mongoose.Schema({
  name: String,
  songs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Song' }]
});

const Song = mongoose.model('Song', SongSchema);
const Playlist = mongoose.model('Playlist', PlaylistSchema);

// 3. Cloudflare Config
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const R2_PUBLIC_URL = "https://pub-71abb8b18eb748488766471d0f373860.r2.dev"; // CHECK IF THIS MATCHES YOURS

// 4. Multer Upload Config (Direct to R2)
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.R2_BUCKET_NAME,
    acl: 'public-read',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      // Keep original filename to parse artist/title later
      cb(null, file.originalname);
    }
  })
});

// --- ROUTES ---

// 📂 BULK UPLOAD ROUTE
// Uploads files -> Saves to DB -> Creates Playlist
app.post('/upload-playlist', upload.array('files'), async (req, res) => {
  try {
    const playlistName = req.body.playlistName || "New Upload";
    const files = req.files;
    const songIds = [];

    console.log(`Uploading ${files.length} songs to playlist: ${playlistName}`);

    for (const file of files) {
      // 1. Check if song exists, if not create it
      let song = await Song.findOne({ r2Key: file.key });
      
      if (!song) {
        // Parse Title/Artist from filename
        let cleanName = file.key.replace(/\(SPOTISAVER\)/g, '').replace('.mp3', '').trim();
        let artist = "Unknown Artist";
        let title = cleanName;
        if (cleanName.includes('-')) {
          const parts = cleanName.split('-');
          artist = parts[0].trim();
          title = parts.slice(1).join('-').trim();
        }

        song = await Song.create({
          title,
          artist,
          r2Key: file.key,
          songUrl: `${R2_PUBLIC_URL}/${encodeURIComponent(file.key)}`
        });
      }
      songIds.push(song._id);
    }

    // 2. Create or Update Playlist
    let playlist = await Playlist.findOne({ name: playlistName });
    if (playlist) {
      // Add new songs to existing playlist (avoid duplicates)
      songIds.forEach(id => {
        if (!playlist.songs.includes(id)) playlist.songs.push(id);
      });
      await playlist.save();
    } else {
      // Create new playlist
      playlist = await Playlist.create({ name: playlistName, songs: songIds });
    }

    res.json({ success: true, message: `Uploaded ${files.length} songs to "${playlistName}"` });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ... (KEEP YOUR EXISTING ROUTES: /sync, /songs, /playlists below) ...

// 🔄 SYNC Route (Keep this!)
app.post('/sync', async (req, res) => {
    // ... (Your existing sync logic code here) ...
    // If you lost it, copy it from the previous step I gave you
    try {
        const command = new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME });
        const data = await s3.send(command);
        if (!data.Contents) return res.json({ message: "Bucket is empty" });

        const mp3Files = data.Contents.filter(f => f.Key.endsWith('.mp3'));
        let addedCount = 0;

        for (const file of mp3Files) {
            const exists = await Song.findOne({ r2Key: file.Key });
            if (!exists) {
                let cleanName = file.Key.replace(/\(SPOTISAVER\)/g, '').replace('.mp3', '').trim();
                let artist = "Unknown Artist";
                let title = cleanName;
                if (cleanName.includes('-')) {
                    const parts = cleanName.split('-');
                    artist = parts[0].trim();
                    title = parts.slice(1).join('-').trim();
                }
                await Song.create({
                    title, artist, r2Key: file.Key,
                    songUrl: `${R2_PUBLIC_URL}/${encodeURIComponent(file.Key)}`
                });
                addedCount++;
            }
        }
        res.json({ success: true, message: `Sync complete! Added ${addedCount} new songs.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Sync failed" });
    }
});

// GET Routes (Keep these!)
app.get('/songs', async (req, res) => {
  const songs = await Song.find().sort({ title: 1 });
  res.json(songs);
});
app.get('/playlists', async (req, res) => {
  const playlists = await Playlist.find().populate('songs');
  res.json(playlists);
});
app.post('/playlists', async (req, res) => {
  const { name } = req.body;
  const newPlaylist = await Playlist.create({ name, songs: [] });
  res.json(newPlaylist);
});
app.post('/playlists/:id/add', async (req, res) => {
  const { songId } = req.body;
  const playlist = await Playlist.findById(req.params.id);
  if (!playlist.songs.includes(songId)) {
    playlist.songs.push(songId);
    await playlist.save();
  }
  res.json(playlist);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));