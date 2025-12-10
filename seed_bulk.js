require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
// 1. Paste your Cloudflare Public URL (without the slash at the end)
// Example: "https://pub-71abb8b...r2.dev"
const R2_BASE_URL = "https://pub-71abb8b18eb748488766471d0f373860.r2.dev"; 

// 2. Point to your mp3 folder
const MP3_FOLDER = path.join(__dirname, 'mp3s'); 

// ---------------------

const songSchema = new mongoose.Schema({
  title: String,
  artist: String,
  songUrl: String,
});
const Song = mongoose.model('Song', songSchema);

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to DB");

    // Read all files in the folder
    const files = fs.readdirSync(MP3_FOLDER);
    
    // Filter only .mp3 files
    const mp3Files = files.filter(file => file.endsWith('.mp3'));

    if (mp3Files.length === 0) {
      console.log("❌ No MP3 files found in the 'mp3s' folder!");
      return;
    }

    console.log(`Found ${mp3Files.length} songs. Preparing to insert...`);

    const songsToAdd = mp3Files.map(filename => {
      // 1. Create the Public URL (Handle spaces with %20 automatically)
      const publicUrl = `${R2_BASE_URL}/${encodeURIComponent(filename)}`;

      // 2. Try to guess Title/Artist from filename (Optional logic)
      // Assuming filename is "Artist - Title.mp3" or just "Title.mp3"
      let artist = "Unknown Artist";
      let title = filename.replace('.mp3', '');

      if (filename.includes('-')) {
        const parts = filename.split('-');
        artist = parts[0].trim();
        title = parts[1].replace('.mp3', '').trim();
      }

      return {
        title: title,
        artist: artist,
        songUrl: publicUrl
      };
    });

    // Bulk Insert
    await Song.insertMany(songsToAdd);
    console.log(`🎉 Successfully added ${songsToAdd.length} songs to the database!`);

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    mongoose.connection.close();
  }
};

seedDatabase();