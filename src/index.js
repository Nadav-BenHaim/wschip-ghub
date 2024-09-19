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
    
  // For simplicity, let's say the current correct answer is stored here
  let correctAnswer = 'a12345';  // The correct RFID tag ID for the current question

  ws.on('message', (message) => {
    //const { command, message: logMessage } = JSON.parse(message);
    const data = JSON.parse(message);  // Parse the incoming WebSocket message
    console.log('Got a message');
    
    switch(data.command){
        case 'print_log':
            console.log('Command from website:', data.message);
            // Broadcast the command to the ESP32 (assuming ESP32 is also connected)
            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ command: 'print_log', message: data.message }));
                }
            });
            break;
        case 'start_input':
            console.log('Forwarding command to start device input mode');
            // Broadcast the command to the ESP32 (assuming ESP32 is also connected)
            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ command: 'start_input', message: data.message }));
                }
            });
            break;
        case 'check_answer':
            // Extract tag_id from the message
            const tagID = data.tag_id;
            console.log('Received tag ID from ESP32:', tagID);

            // Compare the received tag ID with the correct answer
            let isCorrect = tagID === correctAnswer;
            // Send a response back to the ESP32 with the result
            socket.send(JSON.stringify({
              command: 'answer_result',
              correct: isCorrect
            }));
            if (isCorrect) {
              console.log('Correct answer!');
            } else {
              console.log('Wrong answer.');
            }
            break;
        default:
            console.log('Unknown command:', data.command);
            break;
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
