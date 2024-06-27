const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto'); //used to generate random strings
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

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

async function callGemini(prompt) {
  console.log("Prompt:", prompt);
  const { totalTokens } = await model.countTokens(prompt);
  console.log("Tokens count:", totalTokens);

  const result = await model.generateContent(prompt);
  const response = result.response;
  const responseText = response.text();
  console.log(responseText);
  return responseText;
}

async function callGemini2(prompt) {
  try {
    /*
    const fileResult = await fileManager.uploadFile("./data/story.txt", {
      mimeType: "text/plain",
      // It will also add the necessary "files/" prefix if not provided
      name: "files/story3",
      displayName: "story3",
    });
    console.log("File metadata:", fileResult.file.mimeType, fileResult.file.uri);
    */

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
          mimeType: "text/plain", 
          fileUri: "https://generativelanguage.googleapis.com/v1beta/files/story3"
        }
      }
    ]);
    /*
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              fileData: {
                mimeType: fileResult.file.mimeType,
                fileUri: fileResult.file.uri
              }
            },
          ],
        },
      ],
    });
    */
    const response = result.response;
    const responseText = response.text();
    console.log("Gemini response:", responseText);
    return responseText;
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return error;
  }
  return "";
}

async function sendResponseBack(prompt, io, roomId) {
  const responseText = await callGemini2(prompt);
  // io.to(roomId).emit('chat message', prompt);
  io.to(roomId).emit('chat message', responseText);
}

io.on('connection', (socket) => {
  //TODO: handle idle users
  //TODO: handle room management
  
  console.log('a user connected');
  
  // Generate a unique room ID
  const roomId = crypto.randomUUID(); 
  
  // Join the user to the newly created room
  socket.join(roomId);

  // Emit a welcome message to the user in their room
  socket.emit('welcome', `Welcome to room ${roomId}`);

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on('chat message', (msg) => {
    sendResponseBack(msg, io, roomId);
    //io.to(roomId).emit('chat message', msg); //caution: sends message to everyone in the room
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