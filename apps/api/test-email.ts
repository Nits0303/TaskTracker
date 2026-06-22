import * as nodemailer from 'nodemailer';

async function testEmail() {
  console.log('Testing email...');
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: 'nityashah0303@gmail.com',
        pass: 'ntawgyadcwwpxcxn',
      },
    });

    const info = await transporter.sendMail({
      from: 'nityashah0303@gmail.com',
      to: 'nityashah0303@gmail.com',
      subject: 'Test email from task tracker',
      text: 'This is a test email.',
    });

    console.log('Message sent: %s', info.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

testEmail();
