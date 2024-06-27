const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto'); //used to generate random strings
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require('fs');


const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = parseInt(process.env.PORT) || process.argv[3] || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; //TODO: set this from environment variable. right now it is being read from .idx/dev.nix which will not work outside idx ide

app.use(express.static(path.join(__dirname, 'public')))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs');

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
const fileManager = new GoogleAIFileManager(GEMINI_API_KEY);

const chat = model.startChat();

async function uploadFileIfNotExists(filePath) {
  const fileName = path.basename(filePath);
  const fileNameWithoutExtension = fileName.substring(0, fileName.lastIndexOf('.'));
  console.log("filename: ", fileNameWithoutExtension);
  
  try {
    // Check if the file exists locally
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return null;
    }

    // List existing files
    const existingFiles = await fileManager.listFiles();

    // Check if a file with the same name already exists
    const existingFile = existingFiles.files.find(file => file.displayName === fileNameWithoutExtension);

    if (existingFile) {
      console.log(`File "${fileNameWithoutExtension}" already exists. Using existing file.`);
      return existingFile;
    } else {
      // File doesn't exist, so upload it
      console.log(`Uploading file: ${fileNameWithoutExtension}`);
      const uploadResult = await fileManager.uploadFile(filePath, {
        mimeType: "text/csv",
        name: `files/${fileNameWithoutExtension}`,
        displayName: fileNameWithoutExtension
      });
      console.log(`File uploaded successfully: ${fileNameWithoutExtension}`);
      return uploadResult.file;
    }
  } catch (error) {
    console.error(`Error uploading file: ${error.message}`);
    return null;
  }
}

async function callGemini(prompt) {
  
  try {
    const filePath = './data/data-jan-2022-to-jun-2024.csv';
    const fileReference = await uploadFileIfNotExists(filePath);
    if (!fileReference) {
      console.error("Failed to upload file.");
      return;
    }

    // Send the prompt to the model
    const result = await chat.sendMessage([
      { 
        text: "answer only based on the content of the uploaded story"
      }, 
      { 
        text: prompt
      }, 
      { 
        fileData: { 
          mimeType: fileReference.mimeType, 
          fileUri: fileReference.uri
        }
      }
    ]);
    
    const response = result.response;
    const responseText = response.text();
    console.log("Gemini response:", responseText);
    return responseText;
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return error;
  }
}

async function sendResponseBack(prompt, io, roomId) {
  const responseText = await callGemini(prompt);
  io.to(roomId).emit('chat message', responseText);
}

io.on('connection', (socket) => {
  console.log('a user connected');
  const roomId = crypto.randomUUID(); // Generate a unique room ID
  socket.join(roomId); // Join the user to the newly created room

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on('chat message', (msg) => {
    sendResponseBack(msg, io, roomId);
  });

});

server.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});

/*
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/api', (req, res) => {
  res.json({"msg": "Hello world"});
});

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
})
*/