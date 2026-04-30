import { Button } from "@/components/ui/button"
import { Link, createLazyFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"

export const Route = createLazyFileRoute("/privacy-policy")({
    component: PrivacyPolicyPage
})

const EFFECTIVE_DATE = "April 30, 2026"
const APP_NAME = "SilkChat"
const COMPANY_NAME = "DropSilk"
const APP_URL = "https://silkchat.dev"

function PrivacyPolicyPage() {
    return (
        <div className="flex h-screen flex-col overflow-y-auto bg-background">
            <div className="container mx-auto px-4 py-12 md:py-24 lg:max-w-4xl">
                <div className="mb-6 flex items-center gap-4">
                    <Link to="/">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Button>
                    </Link>
                </div>

                <h1 className="mb-6 font-bold text-3xl">{APP_NAME} Privacy Policy</h1>
                <p className="mb-2 text-muted-foreground text-sm">Last Updated: {EFFECTIVE_DATE}</p>
                <p className="mb-2 text-muted-foreground text-sm">
                    Effective Date: {EFFECTIVE_DATE}
                </p>
                <p className="mb-8 text-muted-foreground text-sm">
                    Some operational details below are marked <strong>TO-DO</strong> where the
                    production architecture, legal workflow, or administrative process is not yet
                    finalized.
                </p>

                <PolicySection number="1" title="Introduction">
                    <p className="text-muted-foreground">
                        Welcome to {APP_NAME}, operated by {COMPANY_NAME} ("we", "us", "our"). This
                        Privacy Policy explains how we collect, use, store, disclose, and protect
                        personal data when you use {APP_NAME}, including chat, file upload, image
                        generation, personalization, and related account features available through{" "}
                        <ExternalLink href={APP_URL}>{APP_URL}</ExternalLink> (the "Service").
                    </p>
                    <p className="text-muted-foreground">
                        We are based in Malaysia. Our primary compliance framework is Malaysia's
                        Personal Data Protection Act 2010 (PDPA). Where applicable, we also aim to
                        honor user rights arising under the EU GDPR and the California CCPA/CPRA.
                    </p>
                    <p className="text-muted-foreground">
                        By using the Service, you acknowledge that you have read and understood this
                        Privacy Policy. If you do not agree with it, do not use the Service.
                    </p>
                </PolicySection>

                <PolicySection number="2" title="Information We Collect">
                    <p className="text-muted-foreground">
                        We collect the following categories of information, depending on how you use
                        the Service:
                    </p>

                    <PolicySubsection title="2.1 Account and identity data">
                        <PolicyList>
                            <PolicyItem>
                                Name, email address, avatar, and other profile details you provide
                                or that are returned by an authentication provider.
                            </PolicyItem>
                            <PolicyItem>
                                Authentication identifiers such as internal account IDs, session
                                identifiers, and linked OAuth account identifiers.
                            </PolicyItem>
                            <PolicyItem>
                                If you use Google sign-in, limited account information provided by
                                Google during authentication.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="2.2 User content and generated content">
                        <PolicyList>
                            <PolicyItem>
                                Chat prompts, messages, and conversation history.
                            </PolicyItem>
                            <PolicyItem>
                                Files and attachments uploaded to the Service, including images,
                                PDFs, and other supported documents.
                            </PolicyItem>
                            <PolicyItem>
                                AI-generated responses returned within chat threads.
                            </PolicyItem>
                            <PolicyItem>
                                Image-generation prompts, generated images, and related metadata.
                            </PolicyItem>
                            <PolicyItem>
                                Imported thread content and export metadata where you use import or
                                export features.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="2.3 Settings, personalization, and provider configuration">
                        <PolicyList>
                            <PolicyItem>
                                UI preferences, saved themes, onboarding state, and personalization
                                settings.
                            </PolicyItem>
                            <PolicyItem>
                                Configured model, search, and connector settings associated with
                                your account.
                            </PolicyItem>
                            <PolicyItem>
                                User-supplied provider credentials or API keys where you configure
                                bring-your-own-key functionality. These values are intended to be
                                stored in encrypted form at rest.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="2.4 Technical, device, and log data">
                        <PolicyList>
                            <PolicyItem>
                                IP address, browser type, browser version, operating system, device
                                metadata, locale, and time zone.
                            </PolicyItem>
                            <PolicyItem>
                                Request timestamps, error logs, page visits, feature usage, and
                                basic performance or diagnostic events.
                            </PolicyItem>
                            <PolicyItem>
                                Referrer data and similar request metadata needed to operate,
                                secure, and debug the Service.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="2.5 Usage and analytics data">
                        <PolicyList>
                            <PolicyItem>
                                Product analytics events, such as feature interactions, model
                                selections, and session activity.
                            </PolicyItem>
                            <PolicyItem>
                                We currently use PostHog for analytics when enabled in the running
                                environment.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="2.6 Billing and payment data">
                        <PolicyList>
                            <PolicyItem>
                                Paid-plan billing architecture and payment processor details are{" "}
                                <strong>TO-DO</strong>.
                            </PolicyItem>
                            <PolicyItem>
                                If paid subscriptions are enabled later, this section should be
                                updated with the exact processor, merchant-of-record status, data
                                collected, and retention periods.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="2.7 Cookies and similar technologies">
                        <PolicyList>
                            <PolicyItem>
                                Essential cookies or equivalent session mechanisms used for sign-in,
                                authentication continuity, and security.
                            </PolicyItem>
                            <PolicyItem>
                                Analytics cookies or local identifiers used by PostHog when
                                analytics is enabled.
                            </PolicyItem>
                            <PolicyItem>
                                Local storage or similar browser storage used for app preferences
                                and client-side state.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>
                </PolicySection>

                <PolicySection number="3" title="How We Use Your Data">
                    <PolicySubsection title="3.1 Primary purposes">
                        <PolicyList>
                            <PolicyItem>
                                To provide the Service, including running chats, image generation,
                                file handling, imports, exports, and account features.
                            </PolicyItem>
                            <PolicyItem>
                                To authenticate users, manage sessions, and maintain account
                                security.
                            </PolicyItem>
                            <PolicyItem>
                                To store your threads, files, generated outputs, preferences, and
                                configured settings.
                            </PolicyItem>
                            <PolicyItem>
                                To debug issues, monitor reliability, prevent abuse, and maintain
                                platform integrity.
                            </PolicyItem>
                            <PolicyItem>
                                To improve product usability and prioritize development work using
                                analytics and operational insights.
                            </PolicyItem>
                            <PolicyItem>
                                To communicate with you about account matters, verification, service
                                changes, and legal or security notices.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="3.2 Legal bases we may rely on">
                        <PolicyList>
                            <PolicyItem>
                                Performance of a contract, where processing is required to provide
                                the Service you requested.
                            </PolicyItem>
                            <PolicyItem>
                                Legitimate interests, where processing is reasonably necessary for
                                security, debugging, abuse prevention, analytics, or service
                                improvement.
                            </PolicyItem>
                            <PolicyItem>
                                Consent, where required by law or where we explicitly request it.
                            </PolicyItem>
                            <PolicyItem>
                                Compliance with legal obligations, where applicable.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <p className="text-muted-foreground">
                        We do not use your chat content, uploaded files, generated images, or other
                        user content to train our own AI models. Section 6 explains this in more
                        detail.
                    </p>
                </PolicySection>

                <PolicySection number="4" title="Third-Party Services and AI Providers">
                    <p className="text-muted-foreground">
                        The Service relies on third-party infrastructure and model providers. Your
                        data may be transmitted to the provider needed to fulfill your request or
                        operate the Service.
                    </p>

                    <PolicySubsection title="4.1 AI and model-routing providers">
                        <PolicyList>
                            <PolicyItem>
                                <strong>OpenAI</strong>: Used for supported language or multimodal
                                AI features. Privacy policy:{" "}
                                <ExternalLink href="https://openai.com/policies/privacy-policy/">
                                    openai.com/policies/privacy-policy/
                                </ExternalLink>
                            </PolicyItem>
                            <PolicyItem>
                                <strong>OpenRouter</strong>: Used as a model-routing layer for
                                supported providers and models. Privacy policy:{" "}
                                <ExternalLink href="https://openrouter.ai/privacy">
                                    openrouter.ai/privacy
                                </ExternalLink>
                            </PolicyItem>
                            <PolicyItem>
                                If you configure your own provider keys, your requests may also be
                                processed by whichever third-party providers you enable through your
                                own settings.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="4.2 Hosting, backend, and storage providers">
                        <PolicyList>
                            <PolicyItem>
                                <strong>Vercel</strong>: Used for web hosting, deployment, and edge
                                or server execution. Privacy policy:{" "}
                                <ExternalLink href="https://vercel.com/legal/privacy-policy">
                                    vercel.com/legal/privacy-policy
                                </ExternalLink>
                            </PolicyItem>
                            <PolicyItem>
                                <strong>Convex</strong>: Used as core backend infrastructure for app
                                data, queries, mutations, and related application services.
                            </PolicyItem>
                            <PolicyItem>
                                <strong>Cloudflare R2</strong>: Used for object storage of
                                attachments and generated images. Privacy policy:{" "}
                                <ExternalLink href="https://www.cloudflare.com/privacypolicy/">
                                    www.cloudflare.com/privacypolicy/
                                </ExternalLink>
                            </PolicyItem>
                            <PolicyItem>
                                <strong>PostgreSQL</strong>: Used for authentication-related data
                                and other relational storage needs. The exact managed database
                                vendor in production is <strong>TO-DO</strong> if not yet finalized.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="4.3 Authentication and identity providers">
                        <PolicyList>
                            <PolicyItem>
                                <strong>Better Auth</strong>: Used as the authentication framework
                                within the application stack. Better Auth is a software component in
                                our stack rather than a separate hosted identity processor by
                                itself.
                            </PolicyItem>
                            <PolicyItem>
                                <strong>Google OAuth</strong>: Used when you choose Google sign-in.
                                Privacy policy:{" "}
                                <ExternalLink href="https://policies.google.com/privacy">
                                    policies.google.com/privacy
                                </ExternalLink>
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="4.4 Analytics, email, and payments">
                        <PolicyList>
                            <PolicyItem>
                                <strong>PostHog</strong>: Used for product analytics when enabled.
                                Privacy policy:{" "}
                                <ExternalLink href="https://posthog.com/privacy">
                                    posthog.com/privacy
                                </ExternalLink>
                            </PolicyItem>
                            <PolicyItem>
                                <strong>Email delivery provider</strong>: OTP, verification, or
                                reset emails may be sent using Resend or AWS SES depending on
                                environment configuration. The exact production email provider
                                should be treated as <strong>TO-DO</strong> unless documented
                                elsewhere.
                            </PolicyItem>
                            <PolicyItem>
                                <strong>Payment processor</strong>: <strong>TO-DO</strong>.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>
                </PolicySection>

                <PolicySection number="5" title="Data Retention">
                    <p className="text-muted-foreground">
                        We retain personal data only for as long as needed to operate the Service,
                        satisfy legal requirements, resolve disputes, and enforce our agreements.
                    </p>

                    <PolicyList>
                        <PolicyItem>
                            <strong>Chat threads, messages, and attachments</strong>: Retained until
                            you delete the relevant content or until the related account data is
                            otherwise removed from our systems.
                        </PolicyItem>
                        <PolicyItem>
                            <strong>Generated images and image prompts</strong>: Retained until you
                            delete them or until related account data is removed.
                        </PolicyItem>
                        <PolicyItem>
                            <strong>User settings and provider configuration</strong>: Retained
                            while your account remains active and while the settings remain
                            necessary to operate your chosen configuration.
                        </PolicyItem>
                        <PolicyItem>
                            <strong>Thread export capability</strong>: The app currently supports
                            export of supported thread data. Broader account-wide export packaging
                            is <strong>TO-DO</strong>.
                        </PolicyItem>
                        <PolicyItem>
                            <strong>Account deletion workflow and deletion SLA</strong>:{" "}
                            <strong>TO-DO</strong>. The exact admin process, timeline, and any
                            exceptions for legal retention need to be finalized.
                        </PolicyItem>
                        <PolicyItem>
                            <strong>Inactive account purge policy</strong>: <strong>TO-DO</strong>.
                            Any future inactivity-based deletion rule should be stated here only
                            once implemented and operationally validated.
                        </PolicyItem>
                        <PolicyItem>
                            <strong>Billing records</strong>: If paid billing is introduced later,
                            retention rules for invoices, tax records, chargebacks, and payment
                            metadata are <strong>TO-DO</strong>.
                        </PolicyItem>
                    </PolicyList>
                </PolicySection>

                <PolicySection number="6" title="AI Model Training">
                    <PolicyList>
                        <PolicyItem>
                            We do not use your prompts, messages, uploads, generated images, or
                            other user content to train, fine-tune, or improve our own AI models.
                        </PolicyItem>
                        <PolicyItem>
                            Where available, we intend to use provider settings or API terms that
                            reduce or prevent third-party training on end-user content.
                        </PolicyItem>
                        <PolicyItem>
                            Third-party providers have their own policies. If you use a particular
                            provider directly through a bring-your-own-key configuration, that
                            provider's policies may apply independently.
                        </PolicyItem>
                    </PolicyList>
                </PolicySection>

                <PolicySection number="7" title="Your Rights and Choices">
                    <p className="text-muted-foreground">
                        Depending on your jurisdiction, you may have rights relating to access,
                        correction, deletion, restriction, portability, objection, withdrawal of
                        consent, and complaint handling.
                    </p>

                    <PolicySubsection title="7.1 Malaysian PDPA">
                        <PolicyList>
                            <PolicyItem>
                                Request access to personal data we hold about you.
                            </PolicyItem>
                            <PolicyItem>
                                Request correction of inaccurate or incomplete data.
                            </PolicyItem>
                            <PolicyItem>
                                Withdraw consent, subject to legal or contractual limitations.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="7.2 EU GDPR">
                        <PolicyList>
                            <PolicyItem>
                                Access, rectification, erasure, restriction, and objection.
                            </PolicyItem>
                            <PolicyItem>Data portability where applicable.</PolicyItem>
                            <PolicyItem>
                                Complaint rights with your competent supervisory authority.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="7.3 California CCPA/CPRA">
                        <PolicyList>
                            <PolicyItem>
                                Know what categories of personal information we collect, use, and
                                disclose.
                            </PolicyItem>
                            <PolicyItem>
                                Request deletion of personal information, where applicable.
                            </PolicyItem>
                            <PolicyItem>
                                Opt out of sale or sharing where required by law. We do not sell
                                personal information in the ordinary meaning of that term.
                            </PolicyItem>
                            <PolicyItem>
                                Non-discrimination for exercising privacy rights.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>

                    <PolicySubsection title="7.4 Product-level controls currently available">
                        <PolicyList>
                            <PolicyItem>
                                You may delete supported chat threads and generated images directly
                                from the product interface.
                            </PolicyItem>
                            <PolicyItem>
                                You may export supported thread data using the product's export
                                functionality.
                            </PolicyItem>
                            <PolicyItem>
                                Full account deletion self-service flow: <strong>TO-DO</strong>.
                            </PolicyItem>
                            <PolicyItem>
                                Full account-wide export workflow: <strong>TO-DO</strong>.
                            </PolicyItem>
                        </PolicyList>
                    </PolicySubsection>
                </PolicySection>

                <PolicySection number="8" title="Sharing Your Data">
                    <PolicyList>
                        <PolicyItem>
                            We do not sell your personal data as part of the ordinary operation of
                            the Service.
                        </PolicyItem>
                        <PolicyItem>
                            We share data with processors and infrastructure providers only as
                            needed to deliver the Service, including the providers described in
                            Section 4.
                        </PolicyItem>
                        <PolicyItem>
                            We may disclose information to professional advisers, auditors,
                            insurers, or legal counsel where reasonably necessary.
                        </PolicyItem>
                        <PolicyItem>
                            We may disclose information if required by law, court order, or lawful
                            government request.
                        </PolicyItem>
                        <PolicyItem>
                            We may transfer information in connection with a merger, acquisition,
                            restructuring, financing, or sale of assets, subject to appropriate
                            confidentiality and legal safeguards.
                        </PolicyItem>
                    </PolicyList>
                </PolicySection>

                <PolicySection number="9" title="International Data Transfers">
                    <PolicyList>
                        <PolicyItem>
                            We are based in Malaysia, but our infrastructure and providers may
                            process data in the United States and other countries.
                        </PolicyItem>
                        <PolicyItem>
                            When required, we aim to use contractual, technical, or organizational
                            safeguards appropriate to the relevant transfer.
                        </PolicyItem>
                        <PolicyItem>
                            For EEA users, transfers may rely on Standard Contractual Clauses or
                            other lawful transfer mechanisms where applicable.
                        </PolicyItem>
                    </PolicyList>
                </PolicySection>

                <PolicySection number="10" title="Data Security">
                    <PolicyList>
                        <PolicyItem>
                            We use reasonable technical and organizational safeguards designed to
                            protect personal data against unauthorized access, use, alteration, or
                            disclosure.
                        </PolicyItem>
                        <PolicyItem>
                            Current controls include transport encryption (such as TLS), access
                            controls, and encrypted storage of certain sensitive provider
                            credentials within the app stack.
                        </PolicyItem>
                        <PolicyItem>
                            Security architecture details such as formal key-rotation policy, backup
                            retention policy, and incident-response runbook are{" "}
                            <strong>TO-DO</strong> unless documented elsewhere.
                        </PolicyItem>
                        <PolicyItem>
                            No internet-connected system is perfectly secure, and we cannot
                            guarantee absolute security.
                        </PolicyItem>
                    </PolicyList>
                </PolicySection>

                <PolicySection number="11" title="Children's Privacy">
                    <PolicyList>
                        <PolicyItem>The Service is not intended for children under 13.</PolicyItem>
                        <PolicyItem>
                            We do not knowingly collect personal data from children under 13.
                        </PolicyItem>
                        <PolicyItem>
                            If you believe a child has provided personal data to us, contact us
                            using the details in Section 13 so we can review and address the issue.
                        </PolicyItem>
                    </PolicyList>
                </PolicySection>

                <PolicySection number="12" title="Changes to This Privacy Policy">
                    <PolicyList>
                        <PolicyItem>
                            We may update this Privacy Policy from time to time.
                        </PolicyItem>
                        <PolicyItem>
                            If we make material changes, we will update the effective date and may
                            provide additional notice in the Service or by email where appropriate.
                        </PolicyItem>
                        <PolicyItem>
                            Continued use of the Service after a revised policy becomes effective
                            may constitute acceptance of the revised policy, subject to applicable
                            law.
                        </PolicyItem>
                    </PolicyList>
                </PolicySection>

                <PolicySection number="13" title="Contact Us">
                    <p className="text-muted-foreground">
                        For privacy questions, access requests, correction requests, export
                        requests, or deletion requests, contact:
                    </p>

                    <PolicyList>
                        <PolicyItem>
                            <strong>Operator</strong>: {COMPANY_NAME}
                        </PolicyItem>
                        <PolicyItem>
                            <strong>Mailing address</strong>: <strong>TO-DO</strong>
                        </PolicyItem>
                        <PolicyItem>
                            <strong>Privacy contact email</strong>: <strong>TO-DO</strong>
                        </PolicyItem>
                        <PolicyItem>
                            <strong>Support/admin response SLA</strong>: <strong>TO-DO</strong>
                        </PolicyItem>
                    </PolicyList>
                </PolicySection>

                <p className="mt-12 text-muted-foreground text-sm">
                    By continuing to use {APP_NAME}, you acknowledge this Privacy Policy and the
                    data-handling practices described above, including any items expressly marked{" "}
                    <strong>TO-DO</strong> pending final implementation or legal review.
                </p>
            </div>
        </div>
    )
}

function PolicySection({
    number,
    title,
    children
}: {
    number: string
    title: string
    children: ReactNode
}) {
    return (
        <section className="mb-8 space-y-4">
            <h2 className="font-semibold text-xl">
                {number}. {title}
            </h2>
            {children}
        </section>
    )
}

function PolicySubsection({
    title,
    children
}: {
    title: string
    children: ReactNode
}) {
    return (
        <div className="space-y-3">
            <h3 className="font-medium text-lg">{title}</h3>
            {children}
        </div>
    )
}

function PolicyList({ children }: { children: ReactNode }) {
    return <ul className="list-disc space-y-2 pl-6 text-muted-foreground">{children}</ul>
}

function PolicyItem({ children }: { children: ReactNode }) {
    return <li>{children}</li>
}

function ExternalLink({
    href,
    children
}: {
    href: string
    children: ReactNode
}) {
    return (
        <a
            href={href}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
        >
            {children}
        </a>
    )
}
