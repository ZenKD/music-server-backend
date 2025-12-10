require('dotenv').config();
const mongoose = require('mongoose');

// Define the Schema again (must match server.js)
const songSchema = new mongoose.Schema({
  title: String,
  artist: String,
  songUrl: String,
});
const Song = mongoose.model('Song', songSchema);

// Your Song Data
const newSong = {
  title: "Test Song",        // Change this if you want
  artist: "Unknown Artist",  // Change this if you want
  // PASTE YOUR ACTUAL CLOUDFLARE R2 URL BELOW:
  songUrl: "https://pub-71abb8b18eb748488766471d0f373860.r2.dev/test.mp3" 
};

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ Connected to DB. Inserting song...");
    await Song.create(newSong);
    console.log("🎉 Song added successfully!");
    mongoose.connection.close();
  })
  .catch(err => console.error(err));