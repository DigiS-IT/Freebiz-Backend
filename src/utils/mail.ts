import nodemailer from 'nodemailer';

export const sendMail = async (to: string, subject: string, html: string) => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || '"FreeBiz" <noreply@freebiz.com>';

  let transporter;

  if (host && user && pass) {
    // Real SMTP configuration from .env
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  } else {
    // Dev Fallback: Create Ethereal test account or log to console
    console.log('ℹ️ No SMTP configuration found in .env. Attempting Ethereal test account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } catch (err) {
      console.error('❌ Failed to create Ethereal test account, printing email to console instead:', err);
      console.log('========================================');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`HTML:`);
      console.log(html);
      console.log('========================================');
      return;
    }
  }

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });

  console.log(`✅ Mail sent successfully! MessageId: ${info.messageId}`);
  
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`📧 Ethereal Preview URL: ${previewUrl}`);
  }
};
