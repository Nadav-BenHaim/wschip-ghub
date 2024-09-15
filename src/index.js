const express = require('express');
const admin = require('firebase-admin');

// Decode the base64 key from the environment variable
const firebaseKey = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(firebaseKey)),
  databaseURL: "https://noamcompetition-default-rtdb.firebaseio.com"
});

const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    // Parse the incoming JSON
    const { questionId, answer } = JSON.parse(message);
    
    // Check answer against Firebase
    admin.database().ref(`/QuestionsT/${questionId}/correctAnswer`).once('value')
      .then(snapshot => {
        const correctAnswer = snapshot.val();
        let result;

        // Check if the answer is correct
        if (answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()) {
          result = 'Correct answer!';
        } else {
          result = 'Incorrect answer!';
        }

        // Send result back to the ESP32
        ws.send(result);
      })
      .catch(error => {
        console.error('Error fetching answer:', error);
        ws.send('Error checking answer');
      });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

app.get('/', (req, res) => {
  res.send('WebSocket server is running');
});

app.get('/check-answer/:questionId/:answer', (req, res) => {
  const { questionId, answer } = req.params;

  admin.database().ref(`/QuestionsT/${questionId}/correctAnswer`).once('value')
    .then(snapshot => {
      const correctAnswer = snapshot.val();

      if (answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()) {
        res.json({ correct: true, message: 'Correct answer!' });
      } else {
        res.json({ correct: false, message: 'Incorrect answer!' });
      }
    })
    .catch(error => {
      console.error('Error fetching answer:', error);
      res.status(500).send('Error checking answer');
    });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
