import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  async sendInvite(email: string, password: string) {
    try {
      const response = await this.resend.emails.send({
        from: 'Timeo <onboarding@resend.dev>', // luego puedes cambiarlo
        to: email,
        subject: 'Acceso a Timeo',
        html: `
          <h2>👋 Bienvenido a Timeo</h2>

          <p>Ya puedes empezar a fichar.</p>

          <p>
            👉 Accede desde aquí:<br/>
            <a href="https://timeo-mobile.onrender.com/">
              https://timeo-mobile.onrender.com/
            </a>
          </p>

          <p>
            <strong>Email:</strong> ${email}<br/>
            <strong>Contraseña:</strong> ${password}
          </p>

          <p>
            Desde tu móvil puedes añadir la app a tu pantalla de inicio para usarla como una app normal 📱
          </p>
        `,
      });

      console.log('📩 Email enviado:', response);
      return true;

    } catch (error) {
      console.error('❌ Error enviando email:', error);
      throw error;
    }
  }
}