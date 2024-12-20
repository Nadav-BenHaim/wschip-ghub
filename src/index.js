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

// Store client connections
let esp32Socket = null;
let websiteSocket = null;

 // For simplicity, let's say the current correct answer is stored here
 let correctAnswer = 'a12345';  // The correct RFID tag ID for the current question

 // Track whether there's an active question
 let questionActive = false;
 let questionWasSent = false;
 let cuurentQuestionData;

 // Interval for sending a ping (in milliseconds)
const pingInterval = 50000;  // 50 seconds

wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');
    
  // Send a ping to each connected client periodically
  const pingIntervalId = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  }, pingInterval);

  ws.on('message', (message) => {
    //const { command, message: logMessage } = JSON.parse(message);
    const data = JSON.parse(message);  // Parse the incoming WebSocket message
    console.log('Got a message:');
    console.log(message);
    // Identify the type of client (ESP32 or website)
    if (data.type === 'esp32') {
      esp32Socket = ws;
      console.log('ESP32 connected.');
      if (questionActive && !questionWasSent){
        sendQuestion();
      }
    } else if (data.type === 'website') {
      websiteSocket = ws;
      console.log('Website connected.');
    }

    // After identification, handle other messages (e.g., answer checking)
    handleMessages(ws, data);
  });

  // Reconnection logic if a client disconnects
  ws.on('close', () => {
    if (ws === esp32Socket) {
      console.log('ESP32 disconnected.');
      esp32Socket = null; // Clear the reference so it can reconnect
    }
    if (ws === websiteSocket) {
      console.log('Website disconnected.');
      websiteSocket = null; // Clear the reference so it can reconnect
    }
  });
  // Clear interval when connection closes
  ws.on('close', () => {
    clearInterval(pingIntervalId);
  });
});

function handleMessages(socket, data){
  switch(data.command){
    case 'print_log':
        console.log('Command from website:', data.message);
        // Broadcast the command to the ESP32 (assuming ESP32 is also connected)
        wss.clients.forEach(client => {
            if (client !== socket && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ command: 'print_log', message: data.message }));
            }
        });
        break;
    case 'start_input':
        console.log('Forwarding command to start device input mode');
        // Broadcast the command to the ESP32 (assuming ESP32 is also connected)
        questionActive = true;
        questionWasSent = false;
        cuurentQuestionData = data;
        sendQuestion();
        break;
    case 'check_answer':
        questionActive = false;
        questionWasSent = false;
        // Extract tag_id from the message
        const tagID = data.tag_id;
        console.log('Received tag ID from ESP32:', tagID);

        // Compare the received tag ID with the correct answer
        let isCorrect = tagID === correctAnswer;
        // Send a response back to the ESP32 with the result
        if (esp32Socket && esp32Socket.readyState === WebSocket.OPEN){
          esp32Socket.send(JSON.stringify({ 
            command: 'answer_result',
            correct: isCorrect
          }));
          console.log('sent to esp32.');
        } else {
          console.log('esp32 closed.');
        }
        // Report result back to website
        if (websiteSocket && websiteSocket.readyState === WebSocket.OPEN){
          websiteSocket.send(JSON.stringify({ 
            type: 'answer_result',
            correct: isCorrect, 
            data: tagID,
            answer: tagID
          }));
          console.log('sent to website.');
        } else {
          console.log('website closed.');
        }
        if (isCorrect) {
          console.log('Correct answer!');
        } else {
          console.log('Wrong answer.');
        }
        break;
    case 'select_question':
      // TODO: provide feedback to website
      if (esp32Socket && esp32Socket.readyState === WebSocket.OPEN){
        console.log('Forwarding command to start device input mode');
        correctAnswer = data.correctAnswer;
        esp32Socket.send(JSON.stringify({ command: 'start_input', message: data.message }));
      } else {
        console.log('Tiki device not found!');
      }   
        break;
    default:
        console.log('Unknown command:', data.command);
        break;
  }
}

// send the question to the tiki devide
function sendQuestion(){
  questionActive = true;
  questionWasSent = false;
  if (esp32Socket && esp32Socket.readyState === WebSocket.OPEN){
    esp32Socket.send(JSON.stringify({ 
      command: 'start_input',
      message: cuurentQuestionData.message
    }));
    questionWasSent = true;
    console.log('sent to esp32.');
  } else {
    console.log('esp32 closed.');
  }
}

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
