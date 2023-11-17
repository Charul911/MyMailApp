const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

// Load client secrets from a file and set up OAuth2 client
const credentials = JSON.parse(fs.readFileSync('credentials.json'));
const { client_secret, client_id, redirect_uris } = credentials.web;
const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

// Set the Gmail API version
const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

// Function to list messages from the Gmail inbox
async function listMessages() {
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX'],
    });

    return response.data.messages;
  } catch (error) {
    console.error('Error listing messages:', error.message);
    throw error;
  }
}

async function sendReply(messageId) {
  try {
    // Get the email content
    const message = await gmail.users.messages.get({ userId: 'me', id: messageId });
    const subject = message.data.subject;

    // Log the entire message object for debugging
    console.log('Original Message:', message);

    // Extract sender's email address
    const sender = extractSenderEmail(message);

    if (!sender) {
      console.error('Error: Unable to extract sender email address.');
      return;
    }

    const replyText = `Thank you for your email on "${subject}". I'm currently out on vacation and will get back to you as soon as possible.`;

    // Log relevant information for debugging
    console.log('Sender:', sender);
    console.log('Subject:', subject);
    console.log('Reply Text:', replyText);

    // Send the reply
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: Buffer.from(
          `To: ${sender}\r\nSubject: Re: ${subject}\r\n\r\n${replyText}`
        ).toString('base64'),
      },
    });

    console.log(`Reply sent successfully for email with subject: "${subject}"`);

    // Add a label to the email and move it
    const labelName='VacationReplies'; // Modify label name without spaces
    await createLabelIfNotExists(labelName);
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [labelName],
        removeLabelIds: ['INBOX'],
      },
    });

    console.log(`Label "${labelName}" added and email moved for email with subject: "${subject}"`);

  } catch (error) {
    console.error('Error sending reply:', error.message);
    throw error;
  }
}

// Function to extract sender's email address
function extractSenderEmail(message) {
    try {
      const headers = message.data.payload.headers;
      const fromHeader = headers.find(header => header.name.toLowerCase() === 'from');
  
      if (fromHeader) {
        return fromHeader.value;
      } else {
        console.error('Error: Unable to find "From" header in the email.');
        return undefined;
      }
  
    } catch (error) {
      console.error('Error extracting sender email:', error.message);
      return undefined;
    }
  }

async function createLabelIfNotExists(labelName) {
    try {
      const labels = await gmail.users.labels.list({ userId: 'me' });
      const labelExists = labels.data.labels.some((label) => label.name === labelName);
  
      if (!labelExists) {
        await gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name: labelName,
          },
        });
  
        console.log('Label created:', labelName);
      } else {
        console.log('Label already exists:', labelName);
      }
    } catch (error) {
      console.error('Error creating label:', error.message);
      throw error;
    }
  }
  
// Function to check for new emails and send replies in random intervals
async function processEmails() {
  try {
    const messages = await listMessages();

    // Filter messages with no prior replies
    const firstTimeMessages = messages.filter((message) => !message.labelIds);

    if (firstTimeMessages.length > 0) {
      const randomInterval = Math.floor(Math.random() * (120 - 45 + 1) + 45);
      console.log(`Processing emails in ${randomInterval} seconds...`);

      setTimeout(async () => {
        for (const message of firstTimeMessages) {
          await sendReply(message.id);
        }

        // Repeat the process
        processEmails();
      }, randomInterval * 1000);
    } else {
      // No new emails found, repeat the process after a short interval
      console.log('No new emails found. Checking again in 60 seconds...');
      setTimeout(processEmails, 60000);
    }
  } catch (error) {
    console.error('Error processing emails:', error.message);
  }
}

async function authorize() {
  const tokenPath = 'token.json';

  try {
    const token = fs.readFileSync(tokenPath);
    oAuth2Client.setCredentials(JSON.parse(token));

    console.log('Authorization successful.');
    processEmails(); // Start processing emails after successful authorization
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Token file not found, initiate OAuth2 flow
      await getNewToken();
    } else {
      console.error('Error reading token:', error.message);
      throw error;
    }
  }
}

async function getNewToken() {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
  });

  console.log('Authorize this app by visiting this URL:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter the code from that page here: ', async (code) => {
    rl.close();

    try {
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);

      // Save the token to a file
      fs.writeFileSync('token.json', JSON.stringify(tokens));
      console.log('Token stored to', 'token.json');

      console.log('Authorization successful.');
      processEmails(); // Start processing emails after successful authorization
    } catch (error) {
      console.error('Error getting token:', error.message);
      throw error;
    }
  });
}

// Start the authorization process
authorize();