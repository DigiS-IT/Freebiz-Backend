import nodemailer from 'nodemailer';

export const sendMail = async (to: string, subject: string, html: string) => {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER?.replace(/[\r\n"']/g, '').trim();
  const pass = process.env.SMTP_PASS?.replace(/[\r\n"'\s]/g, '').trim();
  const from = process.env.SMTP_FROM || '"FreeBie" <noreply@freebie.com>';

  let transporter;

  // Print email contents to terminal for easy developer access (e.g. copying magic links)
  if (process.env.NODE_ENV === 'development' || !host) {
    console.log('\n=================== [DEVELOPMENT MAIL LOG] ===================');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    
    // Extract any hyperlinks (like the magic verification link) for quick copy-pasting
    const linkMatch = html.match(/href="([^"]+)"/);
    if (linkMatch && linkMatch[1]) {
      console.log(`🔗 Magic Link: ${linkMatch[1]}`);
    }
    console.log('==============================================================\n');
  }

  if (host && user && pass) {
    // Check if configuration targets Gmail SMTP
    const isGmail = host.toLowerCase().includes('gmail') || host.toLowerCase().includes('google');

    // Real SMTP configuration from .env
    transporter = nodemailer.createTransport({
      ...(isGmail 
        ? { service: 'gmail' } 
        : { host, port, secure: port === 465 }
      ),
      auth: {
        user,
        pass,
      },
      tls: {
        // Do not fail on invalid certificates (especially helpful in dev/local environments)
        rejectUnauthorized: false
      }
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
      console.error('❌ Failed to create Ethereal test account, printed email to console above.');
      return;
    }
  }

  try {
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
  } catch (err: any) {
    console.error(`⚠️ Could not send email via SMTP: ${err.message || err}`);
    if (process.env.NODE_ENV === 'development') {
      console.log('ℹ️ [Dev Mode] Proceeding successfully since the link was printed to the console above.');
    } else {
      throw err;
    }
  }
};

