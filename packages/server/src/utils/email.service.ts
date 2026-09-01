import nodemailer from 'nodemailer';
import { db } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  private static getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
      });
      return this.transporter;
    }

    return null;
  }

  /**
   * Send Welcome & Account Invitation Email
   */
  public static async sendInvitationEmail(options: {
    to: string;
    firstName: string;
    companyName: string;
    role: string;
    invitationToken: string;
    organizationId: string;
    userId: string;
  }): Promise<{ sent: boolean; link: string }> {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const activationLink = `${clientUrl}/activate?token=${options.invitationToken}`;

    const subject = `Welcome to ${options.companyName} — Activate Your Staff Account`;
    const html = `
      <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px; max-width: 550px; margin: auto;">
        <h2 style="color: #38bdf8; margin-top: 0;">Welcome to ${options.companyName}</h2>
        <p>Hello <strong>${options.firstName}</strong>,</p>
        <p>You have been invited to join the workforce platform as a <strong>${options.role}</strong>.</p>
        <p>Please click the button below to set up your password and access your shift schedule, mobile clock-in, and timesheets:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${activationLink}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Activate My Account
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8;">
          Or copy this activation link into your phone's browser:<br/>
          <a href="${activationLink}" style="color: #38bdf8;">${activationLink}</a>
        </p>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
        <p style="font-size: 11px; color: #64748b;">
          ${options.companyName} • Automated Workforce Management
        </p>
      </div>
    `;

    // 1. Record in database notifications table
    db.execute(`
      INSERT INTO notifications (id, organization_id, user_id, title, message, type, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 'INFO', 0, datetime('now'))
    `, [uuidv4(), options.organizationId, options.userId, subject, `Account invitation sent to ${options.to}`]);

    // 2. Dispatch email if SMTP configured
    const transporter = this.getTransporter();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"${options.companyName}" <no-reply@workforcehub.com>`,
          to: options.to,
          subject,
          html
        });
        console.log(`✉️ Live Email successfully sent to ${options.to}`);
        return { sent: true, link: activationLink };
      } catch (err: any) {
        console.error(`⚠️ Email dispatch failed: ${err.message}`);
        return { sent: false, link: activationLink };
      }
    } else {
      console.log(`\n======================================================`);
      console.log(`✉️ [EMAIL NOTIFICATION — SMTP NOT CONFIGURED]`);
      console.log(`To:         ${options.to}`);
      console.log(`Subject:    ${subject}`);
      console.log(`Activation Link: ${activationLink}`);
      console.log(`======================================================\n`);
      return { sent: false, link: activationLink };
    }
  }
}
