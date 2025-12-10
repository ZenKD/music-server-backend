require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const app = express();
app.use(cors());

// 1. Cloudflare Connection
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// 2. Your Public R2 URL (The base link for your music)
// I copied this from your previous screenshot
const R2_PUBLIC_URL = "https://pub-71abb8b18eb748488766471d0f373860.r2.dev";

// 3. The Route: Get Files Directly from Cloudflare
app.get('/songs', async (req, res) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
    });
    
    const data = await s3.send(command);
    
    // If bucket is empty, return empty list
    if (!data.Contents) {
      return res.json([]);
    }

    // Convert Cloudflare file list into our "Song" format
    const songs = data.Contents
      .filter(file => file.Key.endsWith('.mp3')) // Only show MP3s
      .map((file, index) => {
        // Simple logic to guess Artist/Title from filename
        // Assumes format: "Artist - Title.mp3" or just "Title.mp3"
        let artist = "Unknown";
        let title = file.Key.replace('.mp3', '');

        if (file.Key.includes('-')) {
          const parts = file.Key.split('-');
          artist = parts[0].trim();
          title = parts[1].replace('.mp3', '').trim();
        }

        return {
          _id: index, // Temporary ID
          title: title,
          artist: artist,
          // Create the playable link automatically
          songUrl: `${R2_PUBLIC_URL}/${encodeURIComponent(file.Key)}`
        };
      });

    res.json(songs);
  } catch (error) {
    console.error("Error fetching from R2:", error);
    res.status(500).json({ error: 'Failed to fetch songs' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));