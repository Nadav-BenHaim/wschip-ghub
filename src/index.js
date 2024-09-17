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
  console.log('Client connected via WebSocket');

  ws.on('message', (message) => {
    const { action, message: logMessage } = JSON.parse(message);
    console.log('Got a message');

    if (action === 'print_log') {
      console.log('Command from website:', logMessage);
      // Broadcast the command to the ESP32 (assuming ESP32 is also connected)
      wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ action: 'print_log', message: logMessage }));
        }
      });
    }
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
