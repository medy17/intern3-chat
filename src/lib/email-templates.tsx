import {
    Body,
    Container,
    Head,
    Hr,
    Html,
    Img,
    Link,
    Preview,
    Section,
    Text
} from "@react-email/components"

interface EmailVerificationTemplateProps {
    name?: string
    verificationUrl: string
}

export const EmailVerificationTemplate = ({
    name,
    verificationUrl
}: EmailVerificationTemplateProps) => (
    <Html>
        <Head />
        <Preview>Verify your email address for SilkChat</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section>
                    <Text style={heading}>Verify your email address</Text>
                    <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
                    <Text style={text}>
                        Thank you for signing up for SilkChat. To complete your registration, please
                        verify your email address by clicking the link below:
                    </Text>
                    <Link href={verificationUrl} style={button}>
                        Verify Email Address
                    </Link>
                    <Text style={text}>
                        If you didn't create an account, you can safely ignore this email.
                    </Text>
                    <Text style={footer}>
                        This link will expire in 24 hours for security reasons.
                    </Text>
                </Section>
            </Container>
        </Body>
    </Html>
)

interface PasswordResetTemplateProps {
    name?: string
    resetUrl: string
}

export const PasswordResetTemplate = ({ name, resetUrl }: PasswordResetTemplateProps) => (
    <Html>
        <Head />
        <Preview>Reset your password for SilkChat</Preview>
        <Body style={main}>
            <Container style={container}>
                <Section>
                    <Text style={heading}>Reset your password</Text>
                    <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
                    <Text style={text}>
                        We received a request to reset your password for your SilkChat account.
                        Click the link below to create a new password:
                    </Text>
                    <Link href={resetUrl} style={button}>
                        Reset Password
                    </Link>
                    <Text style={text}>
                        If you didn't request a password reset, you can safely ignore this email.
                        Your password will remain unchanged.
                    </Text>
                    <Text style={footer}>
                        This link will expire in 1 hour for security reasons.
                    </Text>
                </Section>
            </Container>
        </Body>
    </Html>
)

interface WelcomeEmailTemplateProps {
    name?: string
    appUrl: string
    logoUrl: string
    supportEmail: string
}

export const WelcomeEmailTemplate = ({
    name,
    appUrl,
    logoUrl,
    supportEmail
}: WelcomeEmailTemplateProps) => (
    <Html>
        <Head />
        <Preview>Your SilkChat account is ready</Preview>
        <Body style={welcomeMain}>
            <Container style={welcomeOuter}>
                <Section style={welcomeCard}>
                    <Section style={logoSection}>
                        <Img
                            src={logoUrl}
                            alt="SilkChat"
                            width="120"
                            height="32"
                            style={logoImage}
                        />
                    </Section>
                    <Text style={welcomeHeading}>Welcome to SilkChat{name ? `, ${name}` : ""}</Text>
                    <Text style={welcomeText}>
                        Your account is ready. SilkChat gives you one place to work across leading
                        AI models, with features like web search, image generation, and live code
                        previews built in.
                    </Text>
                    <Text style={welcomeText}>
                        To get started, open SilkChat and finish setting up your workspace and
                        preferences.
                    </Text>
                    <Section style={buttonSection}>
                        <Link href={appUrl} style={welcomeButton}>
                            Open SilkChat
                        </Link>
                    </Section>
                    <Text style={welcomeListIntro}>A few good places to start:</Text>
                    <Text style={welcomeListItem}>- Try the built-in models</Text>
                    <Text style={welcomeListItem}>
                        - Connect your own API keys if you want more control
                    </Text>
                    <Text style={welcomeListItem}>
                        - Explore onboarding, themes, and the available tools after sign-in
                    </Text>
                    <Hr style={divider} />
                    <Text style={welcomeSupportText}>
                        If you need help, contact us at{" "}
                        <Link href={`mailto:${supportEmail}`} style={inlineLink}>
                            {supportEmail}
                        </Link>
                        .
                    </Text>
                    <Text style={welcomeSignature}>The SilkChat Team</Text>
                </Section>
                <Text style={welcomeFooter}>
                    © 2026 SilkChat. You&apos;re receiving this email because an account was created
                    at silkchat.dev.
                </Text>
            </Container>
        </Body>
    </Html>
)

interface OTPEmailTemplateProps {
    otp: string
    type: "sign-in" | "email-verification" | "forget-password"
}

export const OTPEmailTemplate = ({ otp, type }: OTPEmailTemplateProps) => {
    const getContent = () => {
        switch (type) {
            case "sign-in":
                return {
                    preview: "Your sign-in code for SilkChat",
                    heading: "Your sign-in code",
                    description: "Use this code to sign in to your SilkChat account:"
                }
            case "email-verification":
                return {
                    preview: "Verify your email for SilkChat",
                    heading: "Verify your email",
                    description: "Use this code to verify your email address for SilkChat:"
                }
            case "forget-password":
                return {
                    preview: "Reset your password for SilkChat",
                    heading: "Reset your password",
                    description: "Use this code to reset your password for your SilkChat account:"
                }
        }
    }

    const { preview, heading, description } = getContent()

    return (
        <Html>
            <Head />
            <Preview>{preview}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section>
                        <Text style={headingStyle}>{heading}</Text>
                        <Text style={text}>Hi,</Text>
                        <Text style={text}>{description}</Text>
                        <Text style={otpCode}>{otp}</Text>
                        <Text style={text}>
                            This code will expire in 5 minutes for security reasons.
                        </Text>
                        <Text style={text}>
                            If you didn't request this code, you can safely ignore this email.
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    )
}

// Simple, clean styles
const main = {
    backgroundColor: "#f6f9fc",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
}

const container = {
    backgroundColor: "#ffffff",
    border: "1px solid #e6ebf1",
    borderRadius: "5px",
    margin: "40px auto",
    padding: "20px",
    width: "465px"
}

const heading = {
    color: "#32325d",
    fontSize: "24px",
    fontWeight: "600",
    lineHeight: "1.25",
    margin: "0 0 20px"
}

const text = {
    color: "#525f7f",
    fontSize: "16px",
    lineHeight: "1.4",
    margin: "0 0 16px"
}

const button = {
    backgroundColor: "#656ee8",
    borderRadius: "5px",
    color: "#fff",
    display: "inline-block",
    fontSize: "16px",
    fontWeight: "600",
    lineHeight: "1",
    padding: "12px 20px",
    textDecoration: "none",
    margin: "16px 0"
}

const footer = {
    color: "#8898aa",
    fontSize: "14px",
    lineHeight: "1.4",
    margin: "16px 0 0"
}

const headingStyle = {
    color: "#32325d",
    fontSize: "24px",
    fontWeight: "600",
    lineHeight: "1.25",
    margin: "0 0 20px"
}

const otpCode = {
    backgroundColor: "#f8f9fa",
    border: "2px dashed #dee2e6",
    borderRadius: "8px",
    color: "#212529",
    display: "inline-block",
    fontSize: "32px",
    fontWeight: "700",
    letterSpacing: "8px",
    margin: "20px 0",
    padding: "16px 24px",
    textAlign: "center" as const,
    fontFamily: "Consolas, Monaco, 'Courier New', monospace"
}

const welcomeMain = {
    backgroundColor: "#fcfcfc",
    color: "#000000",
    fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    margin: "0",
    padding: "0"
}

const welcomeOuter = {
    margin: "0 auto",
    maxWidth: "600px",
    padding: "40px 20px"
}

const logoSection = {
    paddingBottom: "20px",
    textAlign: "center" as const
}

const logoImage = {
    display: "block",
    height: "auto",
    margin: "0 auto"
}

const buttonSection = {
    margin: "4px 0 24px",
    textAlign: "center" as const
}

const welcomeCard = {
    backgroundColor: "#ffffff",
    border: "1px solid #e4e4e4",
    borderRadius: "8px",
    padding: "32px"
}

const welcomeHeading = {
    color: "#000000",
    fontSize: "28px",
    fontWeight: "600",
    lineHeight: "1.25",
    margin: "0 0 16px"
}

const welcomeText = {
    color: "#171717",
    fontSize: "16px",
    lineHeight: "1.6",
    margin: "0 0 20px"
}

const welcomeButton = {
    backgroundColor: "#000000",
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "16px",
    fontWeight: "500",
    lineHeight: "1",
    padding: "14px 22px",
    textDecoration: "none"
}

const welcomeListIntro = {
    color: "#171717",
    fontSize: "16px",
    lineHeight: "1.6",
    margin: "0 0 10px",
    fontWeight: "500"
}

const welcomeListItem = {
    color: "#525252",
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 8px"
}

const divider = {
    borderColor: "#e4e4e4",
    margin: "28px 0"
}

const welcomeSupportText = {
    color: "#525252",
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 20px"
}

const inlineLink = {
    color: "#000000",
    textDecoration: "underline"
}

const welcomeSignature = {
    color: "#000000",
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0"
}

const welcomeFooter = {
    color: "#525252",
    fontSize: "13px",
    lineHeight: "1.6",
    margin: "20px 0 0",
    textAlign: "center" as const
}
