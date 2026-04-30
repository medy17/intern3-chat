import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses"
import { render } from "@react-email/render"
import { Resend } from "resend"
import {
    EmailVerificationTemplate,
    OTPEmailTemplate,
    PasswordResetTemplate,
    WelcomeEmailTemplate
} from "./email-templates"
import { loadServerEnv } from "./load-server-env"

loadServerEnv()

// Email provider types
type EmailProvider = "resend" | "ses" | "local-only-mock"

interface EmailConfig {
    provider: EmailProvider
    from: string
    resend?: {
        apiKey: string
    }
    ses?: {
        region: string
        accessKeyId?: string
        secretAccessKey?: string
    }
}

interface SendEmailOptions {
    to: string
    subject: string
    html: string
    text?: string
}

const DEFAULT_APP_URL = "https://silkchat.dev"
const DEFAULT_SUPPORT_EMAIL = "support@silkchat.dev"

const normalizeUrl = (value?: string) => {
    if (!value) return undefined
    const trimmedValue = value.trim()
    if (!trimmedValue) return undefined
    return trimmedValue.startsWith("http://") || trimmedValue.startsWith("https://")
        ? trimmedValue
        : `https://${trimmedValue}`
}

class EmailService {
    private config?: EmailConfig
    private resend?: Resend
    private sesClient?: SESClient

    constructor() {
        this.initializeProvider()
    }

    private getEmailConfig(): EmailConfig {
        const provider = (process.env.EMAIL_PROVIDER || "resend") as EmailProvider

        return {
            provider,
            from: process.env.EMAIL_FROM || "noreply@silkchat.dev",
            resend:
                provider === "resend"
                    ? process.env.RESEND_API_KEY
                        ? {
                              apiKey: process.env.RESEND_API_KEY!
                          }
                        : undefined
                    : undefined,
            ses:
                provider === "ses"
                    ? process.env.AWS_REGION
                        ? {
                              region: process.env.AWS_REGION!,
                              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
                          }
                        : undefined
                    : undefined
        }
    }

    private initializeProvider() {
        this.config = this.getEmailConfig()
        this.resend = undefined
        this.sesClient = undefined

        if (this.config.provider === "resend" && this.config.resend) {
            this.resend = new Resend(this.config.resend.apiKey)
        } else if (this.config.provider === "ses" && this.config.ses) {
            this.sesClient = new SESClient({
                region: this.config.ses.region,
                ...(this.config.ses.accessKeyId &&
                    this.config.ses.secretAccessKey && {
                        credentials: {
                            accessKeyId: this.config.ses.accessKeyId,
                            secretAccessKey: this.config.ses.secretAccessKey
                        }
                    })
            })
        }
    }

    private ensureConfigured() {
        this.initializeProvider()

        if (!this.config) {
            throw new Error("Email configuration is unavailable")
        }

        if (this.config.provider === "resend" && !this.config.resend?.apiKey) {
            throw new Error("RESEND_API_KEY is required when using Resend provider")
        }

        if (this.config.provider === "ses" && !this.config.ses?.region) {
            throw new Error("AWS_REGION is required when using SES provider")
        }

        return this.config
    }

    isConfigured() {
        const config = this.getEmailConfig()

        if (config.provider === "resend") {
            return Boolean(config.resend?.apiKey)
        }

        if (config.provider === "ses") {
            return Boolean(config.ses?.region)
        }

        return process.env.NODE_ENV === "development"
    }

    getAppUrl() {
        return normalizeUrl(process.env.VITE_BETTER_AUTH_URL) || DEFAULT_APP_URL
    }

    getLogoUrl() {
        return `${DEFAULT_APP_URL}/logo-highres.png`
    }

    getSupportEmail() {
        return process.env.SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL
    }

    private async sendWithResend(options: SendEmailOptions) {
        if (!this.resend) {
            throw new Error("Resend client not initialized")
        }

        const result = await this.resend.emails.send({
            from: this.config?.from || "noreply@silkchat.dev",
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text
        })

        if (result.error) {
            throw new Error(`Resend error: ${result.error.message}`)
        }

        return result
    }

    private async sendWithSES(options: SendEmailOptions) {
        if (!this.sesClient) {
            throw new Error("SES client not initialized")
        }

        const command = new SendEmailCommand({
            Source: this.config?.from || "noreply@silkchat.dev",
            Destination: {
                ToAddresses: [options.to]
            },
            Message: {
                Subject: {
                    Data: options.subject,
                    Charset: "UTF-8"
                },
                Body: {
                    Html: {
                        Data: options.html,
                        Charset: "UTF-8"
                    },
                    ...(options.text && {
                        Text: {
                            Data: options.text,
                            Charset: "UTF-8"
                        }
                    })
                }
            }
        })

        return await this.sesClient.send(command)
    }

    async sendEmail(options: SendEmailOptions) {
        try {
            const config = this.ensureConfigured()

            if (config.provider === "resend") {
                return await this.sendWithResend(options)
            }

            if (config.provider === "ses") {
                return await this.sendWithSES(options)
            }

            if (config.provider === "local-only-mock") {
                if (process.env.NODE_ENV !== "development") {
                    throw new Error(
                        "Local mock email provider is only available in development mode"
                    )
                }
                console.log("Sending email with local mock:", options)
                return {}
            }

            throw new Error(`Unsupported email provider: ${config.provider}`)
        } catch (error) {
            console.error("Failed to send email:", error)
            throw error
        }
    }

    async sendVerificationEmail(data: {
        user: { email: string; name?: string }
        url: string
        token: string
    }) {
        const html = await render(
            EmailVerificationTemplate({
                name: data.user.name,
                verificationUrl: data.url
            })
        )

        console.debug(`Sending verification email to ${data.user.email} with URL: ${data.url}`)

        await this.sendEmail({
            to: data.user.email,
            subject: "Verify your email address - SilkChat",
            html,
            text: `Hi ${data.user.name || ""},\n\nPlease verify your email address by clicking this link: ${data.url}\n\nIf you didn't create an account, you can safely ignore this email.`
        })
    }

    async sendPasswordResetEmail(data: {
        user: { email: string; name?: string }
        url: string
        token: string
    }) {
        const html = await render(
            PasswordResetTemplate({
                name: data.user.name,
                resetUrl: data.url
            })
        )

        await this.sendEmail({
            to: data.user.email,
            subject: "Reset your password - SilkChat",
            html,
            text: `Hi ${data.user.name || ""},\n\nYou can reset your password by clicking this link: ${data.url}\n\nIf you didn't request a password reset, you can safely ignore this email.`
        })
    }

    async sendWelcomeEmail(data: { user: { email: string; name?: string }; appUrl?: string }) {
        const appUrl = data.appUrl || this.getAppUrl()
        const supportEmail = this.getSupportEmail()
        const html = await render(
            WelcomeEmailTemplate({
                name: data.user.name,
                appUrl,
                logoUrl: this.getLogoUrl(),
                supportEmail
            })
        )

        await this.sendEmail({
            to: data.user.email,
            subject: "Welcome to SilkChat",
            html,
            text: `${data.user.name ? `Hi ${data.user.name},` : "Hi,"}\n\nWelcome to SilkChat. Your account is ready.\n\nSilkChat gives you one place to work across leading AI models, with web search, image generation, and live code previews built in.\n\nOpen SilkChat: ${appUrl}\n\nA few good places to start:\n- Try the built-in models\n- Connect your own API keys if you want more control\n- Explore onboarding, themes, and the available tools after sign-in\n\nIf you need help, contact us at ${supportEmail}.\n\nThe SilkChat Team`
        })
    }

    async sendOTPEmail(data: {
        email: string
        otp: string
        type: "sign-in" | "email-verification" | "forget-password"
    }) {
        const getSubjectAndTemplate = async () => {
            switch (data.type) {
                case "sign-in":
                    return {
                        subject: "Your sign-in code - SilkChat",
                        html: await render(
                            OTPEmailTemplate({
                                otp: data.otp,
                                type: "sign-in"
                            })
                        ),
                        text: `Your sign-in code for SilkChat is: ${data.otp}\n\nThis code will expire in 5 minutes.`
                    }
                case "email-verification":
                    return {
                        subject: "Verify your email - SilkChat",
                        html: await render(
                            OTPEmailTemplate({
                                otp: data.otp,
                                type: "email-verification"
                            })
                        ),
                        text: `Your email verification code for SilkChat is: ${data.otp}\n\nThis code will expire in 5 minutes.`
                    }
                case "forget-password":
                    return {
                        subject: "Reset your password - SilkChat",
                        html: await render(
                            OTPEmailTemplate({
                                otp: data.otp,
                                type: "forget-password"
                            })
                        ),
                        text: `Your password reset code for SilkChat is: ${data.otp}\n\nThis code will expire in 5 minutes.`
                    }
            }
        }

        const { subject, html, text } = await getSubjectAndTemplate()

        console.debug(`Sending ${data.type} OTP email to ${data.email} with code: ${data.otp}`)

        await this.sendEmail({
            to: data.email,
            subject,
            html,
            text
        })
    }
}

// Export singleton instance
export const emailService = new EmailService()

// Export individual functions for Better Auth
export const sendEmail = emailService.sendEmail.bind(emailService)
export const sendVerificationEmail = emailService.sendVerificationEmail.bind(emailService)
export const sendPasswordResetEmail = emailService.sendPasswordResetEmail.bind(emailService)
export const sendWelcomeEmail = emailService.sendWelcomeEmail.bind(emailService)
export const sendOTPEmail = emailService.sendOTPEmail.bind(emailService)
export const isEmailConfigured = emailService.isConfigured.bind(emailService)
