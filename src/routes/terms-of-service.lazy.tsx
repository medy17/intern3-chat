import { Button } from "@/components/ui/button"
import { Link, createLazyFileRoute } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"

export const Route = createLazyFileRoute("/terms-of-service")({
    component: TermsOfServicePage
})

const EFFECTIVE_DATE = "April 30, 2026"
const APP_NAME = "SilkChat"
const COMPANY_NAME = "DropSilk"
const APP_URL = "https://silkchat.dev"

function TermsOfServicePage() {
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

                <h1 className="mb-6 font-bold text-3xl">{APP_NAME} Terms of Service</h1>
                <p className="mb-2 text-muted-foreground text-sm">Last Updated: {EFFECTIVE_DATE}</p>
                <p className="mb-2 text-muted-foreground text-sm">
                    Effective Date: {EFFECTIVE_DATE}
                </p>
                <p className="mb-8 text-muted-foreground text-sm">
                    Some commercial, jurisdictional, billing, and enforcement details below are
                    marked <strong>TO-DO</strong> where the final legal or operational structure is
                    not yet finalized.
                </p>

                <TermsSection number="1" title="Introduction">
                    <p className="text-muted-foreground">
                        Welcome to {APP_NAME}. Your use of the website, application, and related
                        features that link to these Terms of Service (the "Terms"), including chat,
                        file upload, image generation, thread import and export, personalization,
                        integrations, and any related software or services we make available
                        (collectively, the "Services"), is governed by these Terms. For purposes of
                        these Terms, "we," "our," "us," and "{APP_NAME}" refer to {COMPANY_NAME},
                        the provider and operator of the Services.
                    </p>
                    <p className="text-muted-foreground">
                        You must agree to these Terms in order to use the Services. If you are using
                        the Services on behalf of an organization, you are agreeing to these Terms
                        for that organization and representing that you have authority to bind that
                        organization. In that case, "you" and "your" also refer to that
                        organization, where applicable.
                    </p>
                    <p className="text-muted-foreground">
                        You must be at least 13 years old to use the Services. If you are over 13
                        but below the age required in your jurisdiction to form a binding contract,
                        you may use the Services only with the involvement and consent of a parent
                        or legal guardian.
                    </p>
                    <p className="text-muted-foreground">
                        Your purchases or use of the Services are not contingent on delivery of any
                        future functionality or features, and are not dependent on any public
                        statements we may make about future development.
                    </p>
                    <p className="text-muted-foreground">
                        If you have entered into a separate written agreement with us for use of the
                        Services, that agreement will control to the extent it conflicts with these
                        Terms for the Services covered by that agreement.
                    </p>
                    <p className="text-muted-foreground">
                        <strong>Arbitration, venue, and governing law details are TO-DO.</strong>{" "}
                        Any final dispute-resolution clause should be reviewed and finalized before
                        being treated as binding commercial policy.
                    </p>
                    <p className="text-muted-foreground">
                        By using, downloading, installing, or otherwise accessing the Services, you
                        agree to be bound by these Terms. If you do not accept these Terms, you may
                        not use the Services.
                    </p>
                </TermsSection>

                <TermsSection number="2" title="Accounts">
                    <TermsList>
                        <TermsItem>
                            You may need to register an account to use some or all of the Services.
                        </TermsItem>
                        <TermsItem>
                            You agree to provide accurate, current, and complete information, and to
                            keep that information updated.
                        </TermsItem>
                        <TermsItem>
                            Your account is for your use only, and you may not share access in a
                            manner inconsistent with these Terms or any applicable plan limits.
                        </TermsItem>
                        <TermsItem>
                            You are responsible for safeguarding your login credentials and for all
                            activity that occurs under your account.
                        </TermsItem>
                        <TermsItem>
                            You must notify us promptly if you become aware of unauthorized access
                            to your account or any suspected security breach.
                        </TermsItem>
                    </TermsList>
                </TermsSection>

                <TermsSection number="3" title="Content">
                    <p className="text-muted-foreground">
                        You may upload, create, store, transmit, share, publish, display, or
                        otherwise make available content through the Services, including text,
                        prompts, files, code, images, audio, documents, or other materials ("User
                        Content").
                    </p>

                    <TermsSubsection title="3.1 Responsibility for User Content">
                        <TermsList>
                            <TermsItem>
                                You are solely responsible for your User Content and for your use of
                                it through the Services.
                            </TermsItem>
                            <TermsItem>
                                You represent that you have all rights, permissions, and authority
                                necessary to upload, store, process, share, or otherwise use your
                                User Content in connection with the Services.
                            </TermsItem>
                            <TermsItem>
                                You are responsible for ensuring your User Content does not violate
                                law, third-party rights, contractual obligations, or these Terms.
                            </TermsItem>
                            <TermsItem>
                                You control whether to share supported content with others and are
                                responsible for making appropriate choices about what you upload or
                                share.
                            </TermsItem>
                        </TermsList>
                    </TermsSubsection>

                    <TermsSubsection title="3.2 Monitoring and enforcement">
                        <TermsList>
                            <TermsItem>
                                We do <strong>not actively monitor user content</strong> you upload,
                                generate, store, or share through the Services.
                            </TermsItem>
                            <TermsItem>
                                We reserve the right, in our sole discretion, to investigate,
                                review, remove, restrict, or disable access to User Content, and to
                                suspend or terminate accounts, if we become aware of conduct or
                                content that may violate these Terms, applicable law, intellectual
                                property rights, platform safety requirements, or the rights of
                                others.
                            </TermsItem>
                            <TermsItem>
                                We assume no liability for User Content stored by you or any third
                                party through the Services.
                            </TermsItem>
                            <TermsItem>
                                You understand that deleted content may be irretrievable.
                            </TermsItem>
                        </TermsList>
                    </TermsSubsection>

                    <TermsSubsection title="3.3 Our content">
                        <p className="text-muted-foreground">
                            The Services may also contain information, software, models, branding,
                            UI, documentation, or other materials supplied by us or our suppliers ("
                            {APP_NAME}-Supplied Content"). We do not guarantee that such content
                            will always be accurate, complete, or up to date.
                        </p>
                    </TermsSubsection>
                </TermsSection>

                <TermsSection number="4" title="Proprietary Rights">
                    <TermsList>
                        <TermsItem>
                            By submitting or uploading User Content through the Services, you grant
                            us a worldwide, non-exclusive, royalty-free license to host, store,
                            reproduce, adapt, modify, transmit, and otherwise use that User Content
                            solely as necessary to operate, provide, secure, improve, and support
                            the Services for you.
                        </TermsItem>
                        <TermsItem>
                            Except for the limited license above, you retain your ownership rights
                            in your User Content.
                        </TermsItem>
                        <TermsItem>
                            We and our licensors own all rights, title, and interest in the Services
                            and in {APP_NAME}-Supplied Content, including related intellectual
                            property rights.
                        </TermsItem>
                        <TermsItem>
                            Nothing in these Terms gives you a right to use our trademarks, logos,
                            service marks, or other branding except as expressly permitted by law or
                            by our prior written consent.
                        </TermsItem>
                    </TermsList>
                </TermsSection>

                <TermsSection number="5" title="License from Us and Restrictions on Use">
                    <p className="text-muted-foreground">
                        Subject to these Terms, we grant you a limited, personal, non-exclusive,
                        non-transferable, non-sublicensable license to use the Services.
                    </p>

                    <TermsSubsection title="5.1 Restrictions">
                        <TermsList>
                            <TermsItem>
                                You may not copy, modify, distribute, sell, lease, sublicense,
                                reverse engineer, decompile, or attempt to extract source code from
                                the Services except as permitted by applicable law.
                            </TermsItem>
                            <TermsItem>
                                You may not disable, interfere with, or circumvent security,
                                authentication, rate limits, quotas, billing controls, or access
                                restrictions used by the Services.
                            </TermsItem>
                            <TermsItem>
                                You may not use the Services to build or operate a competing service
                                by scraping, bulk extraction, automated harvesting, or similar
                                methods.
                            </TermsItem>
                            <TermsItem>
                                You may not interfere with the normal operation of the Services or
                                the infrastructure connected to them.
                            </TermsItem>
                            <TermsItem>
                                You may not use the Services to avoid fees, exceed permitted usage,
                                or misuse shared infrastructure.
                            </TermsItem>
                        </TermsList>
                    </TermsSubsection>

                    <TermsSubsection title="5.2 Prohibited conduct">
                        <TermsList>
                            <TermsItem>
                                You may not use the Services to engage in unlawful, fraudulent,
                                abusive, harassing, hateful, defamatory, obscene, or harmful
                                conduct.
                            </TermsItem>
                            <TermsItem>
                                You may not upload or transmit malware, phishing content, or other
                                materials designed to damage systems, steal information, or gain
                                unauthorized access.
                            </TermsItem>
                            <TermsItem>
                                You may not infringe the intellectual property, privacy, publicity,
                                or other legal rights of others.
                            </TermsItem>
                            <TermsItem>
                                You may not impersonate others, misrepresent affiliation, or use
                                materially false or misleading identities or statements.
                            </TermsItem>
                            <TermsItem>
                                You may not use the Services if you are prohibited from receiving
                                them under applicable trade, sanctions, export control, or similar
                                laws.
                            </TermsItem>
                        </TermsList>
                    </TermsSubsection>
                </TermsSection>

                <TermsSection number="6" title="Pricing Terms">
                    <TermsList>
                        <TermsItem>
                            Some parts of the Services may be available free of charge, while other
                            parts may be subject to usage limits, paid plans, credits, or other
                            pricing rules.
                        </TermsItem>
                        <TermsItem>
                            The exact pricing, quota, credit, billing, and overage model is{" "}
                            <strong>TO-DO</strong> unless separately described in the product at the
                            time of purchase or use.
                        </TermsItem>
                        <TermsItem>
                            If paid plans or credits are introduced or expanded, your use of those
                            paid features may be subject to additional commercial terms presented at
                            checkout or in-product.
                        </TermsItem>
                    </TermsList>
                </TermsSection>

                <TermsSection number="7" title="Right of Withdrawal (EU Customers)">
                    <p className="text-muted-foreground">
                        Consumer withdrawal and digital-content cancellation rights for EU customers
                        are <strong>TO-DO</strong>. If or when paid consumer digital services are
                        offered directly by us, this section should be updated to reflect the final
                        billing and fulfillment model.
                    </p>
                </TermsSection>

                <TermsSection number="8" title="Privacy">
                    <TermsList>
                        <TermsItem>
                            Your use of the Services is also subject to our Privacy Policy.
                        </TermsItem>
                        <TermsItem>
                            You agree to protect the privacy and legal rights of any third parties
                            whose data may appear in your User Content.
                        </TermsItem>
                        <TermsItem>
                            If your use case requires compliance with specialized laws or
                            regulations, including laws relating to children, education, healthcare,
                            employment, or regulated industries, you are solely responsible for
                            ensuring your own compliance unless we have expressly agreed otherwise
                            in writing.
                        </TermsItem>
                        <TermsItem>
                            Use of customer names, logos, or public customer references in marketing
                            materials is <strong>TO-DO</strong> and should not be assumed without an
                            explicit policy or separate agreement.
                        </TermsItem>
                    </TermsList>
                </TermsSection>

                <TermsSection number="9" title="Modification and Termination of Services">
                    <TermsList>
                        <TermsItem>
                            We may modify, suspend, or discontinue all or part of the Services from
                            time to time, including features, integrations, quotas, pricing,
                            availability, and technical architecture.
                        </TermsItem>
                        <TermsItem>
                            We may terminate or suspend your access if we believe you have violated
                            these Terms, created risk for us or others, or if continued operation is
                            not commercially, legally, or technically feasible.
                        </TermsItem>
                        <TermsItem>
                            Account cancellation, refund policy, and post-termination retrieval
                            workflow details are <strong>TO-DO</strong> to the extent they are not
                            already presented in-product.
                        </TermsItem>
                        <TermsItem>
                            You are responsible for exporting your User Content before terminating
                            your use of the Services.
                        </TermsItem>
                        <TermsItem>
                            Any provisions of these Terms that by their nature should survive
                            termination will survive, including ownership, disclaimers, liability
                            limitations, indemnity, and dispute-related provisions.
                        </TermsItem>
                    </TermsList>
                </TermsSection>

                <TermsSection number="10" title="Beta Services">
                    <TermsList>
                        <TermsItem>
                            We may offer alpha, beta, preview, early-access, or evaluation features
                            ("Beta Services").
                        </TermsItem>
                        <TermsItem>
                            Beta Services may be incomplete, unstable, or unreliable, and your use
                            of them is voluntary and at your sole risk.
                        </TermsItem>
                        <TermsItem>
                            Beta Services are provided "as is" and may be changed or withdrawn at
                            any time.
                        </TermsItem>
                        <TermsItem>
                            If a Beta Service is identified as confidential, you agree not to
                            disclose it without our prior written consent.
                        </TermsItem>
                    </TermsList>
                </TermsSection>

                <TermsSection number="11" title="Changes to the Terms">
                    <TermsList>
                        <TermsItem>We may amend or update these Terms from time to time.</TermsItem>
                        <TermsItem>
                            Updated Terms become effective when posted or when otherwise
                            communicated, unless a different effective date is specified.
                        </TermsItem>
                        <TermsItem>
                            By continuing to use the Services after revised Terms become effective,
                            you agree to be bound by them.
                        </TermsItem>
                    </TermsList>
                </TermsSection>

                <TermsSection number="12" title="Disclaimer of Warranty">
                    <p className="text-muted-foreground">
                        THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE." TO THE MAXIMUM EXTENT
                        PERMITTED BY APPLICABLE LAW, WE DISCLAIM ALL WARRANTIES, WHETHER EXPRESS,
                        IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WARRANTIES OF MERCHANTABILITY,
                        FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AND THAT THE
                        SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR SUITABLE FOR YOUR
                        PARTICULAR NEEDS.
                    </p>
                    <p className="text-muted-foreground">
                        NOTHING IN THESE TERMS SHALL EXCLUDE OR LIMIT LIABILITY OR WARRANTIES THAT
                        CANNOT BE EXCLUDED OR LIMITED UNDER APPLICABLE LAW.
                    </p>
                </TermsSection>

                <TermsSection number="13" title="Limitation of Liability">
                    <p className="text-muted-foreground">
                        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, WE WILL NOT BE LIABLE FOR
                        ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE
                        DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, GOODWILL, DATA, BUSINESS
                        INTERRUPTION, OR OTHER INTANGIBLE LOSSES ARISING OUT OF OR RELATING TO THE
                        SERVICES OR THESE TERMS.
                    </p>
                    <p className="text-muted-foreground">
                        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, OUR TOTAL LIABILITY FOR
                        ALL CLAIMS ARISING OUT OF OR RELATING TO THE SERVICES OR THESE TERMS WILL
                        NOT EXCEED THE GREATER OF: (A) THE AMOUNT YOU PAID US FOR THE RELEVANT
                        SERVICES IN THE TWELVE MONTHS BEFORE THE CLAIM AROSE; OR (B) USD $100.
                    </p>
                    <p className="text-muted-foreground">
                        SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS OF LIABILITY, SO SOME OR
                        ALL OF THE ABOVE MAY NOT APPLY TO YOU.
                    </p>
                </TermsSection>

                <TermsSection number="14" title="Indemnification">
                    <p className="text-muted-foreground">
                        You agree to defend, indemnify, and hold harmless {COMPANY_NAME}, its
                        affiliates, officers, directors, employees, contractors, licensors, and
                        service providers from and against claims, damages, losses, liabilities,
                        costs, and expenses, including reasonable legal fees, arising out of or
                        related to your User Content, your use of the Services, your violation of
                        these Terms, or your violation of applicable law or third-party rights.
                    </p>
                </TermsSection>

                <TermsSection number="15" title="Copyright Policy">
                    <p className="text-muted-foreground">
                        We respect intellectual property rights and expect users to do the same. If
                        you believe material available through the Services infringes your
                        copyright, you may submit a notice containing:
                    </p>
                    <TermsList>
                        <TermsItem>
                            Identification of the copyrighted work claimed to be infringed.
                        </TermsItem>
                        <TermsItem>
                            Identification of the allegedly infringing material and its location.
                        </TermsItem>
                        <TermsItem>
                            Your contact information, including mailing address and email address.
                        </TermsItem>
                        <TermsItem>
                            A good-faith statement that the disputed use is unauthorized.
                        </TermsItem>
                        <TermsItem>
                            A statement, under penalty of perjury, that the information in the
                            notice is accurate and that you are authorized to act on behalf of the
                            rights holder.
                        </TermsItem>
                        <TermsItem>Your physical or electronic signature.</TermsItem>
                    </TermsList>
                    <p className="text-muted-foreground">
                        Designated copyright agent name, legal address, and DMCA contact email are{" "}
                        <strong>TO-DO</strong>.
                    </p>
                </TermsSection>

                <TermsSection number="16" title="Third-Party Content and Materials">
                    <TermsList>
                        <TermsItem>
                            The Services may allow you to access third-party websites, models, APIs,
                            tools, connectors, outputs, search results, or other third-party
                            materials.
                        </TermsItem>
                        <TermsItem>
                            You assume the risk of using or relying on third-party materials.
                        </TermsItem>
                        <TermsItem>
                            We are not responsible for the availability, accuracy, legality, or
                            quality of third-party materials, and we do not guarantee that they will
                            remain available through the Services.
                        </TermsItem>
                    </TermsList>
                </TermsSection>

                <TermsSection number="17" title="Third-Party Software">
                    <p className="text-muted-foreground">
                        The Services may include or rely on third-party software, libraries, models,
                        or open-source components. Those components may be governed by their own
                        license terms, and nothing in these Terms limits your rights under any
                        applicable third-party license.
                    </p>
                </TermsSection>

                <TermsSection number="18" title="Feedback">
                    <p className="text-muted-foreground">
                        If you submit feedback, ideas, suggestions, or proposals regarding the
                        Services, you agree that we may use them without restriction and without any
                        obligation to compensate you, credit you, or keep them confidential, unless
                        we expressly agree otherwise in writing.
                    </p>
                </TermsSection>

                <TermsSection number="19" title="Disputes">
                    <p className="text-muted-foreground">
                        Governing law, venue, arbitration procedure, opt-out procedure, class-action
                        waiver, and limitation periods are <strong>TO-DO</strong>. Until finalized,
                        this section should not be treated as a complete dispute-resolution clause.
                    </p>
                </TermsSection>

                <TermsSection number="20" title="Miscellaneous">
                    <TermsList>
                        <TermsItem>
                            These Terms, together with our Privacy Policy and any additional terms
                            properly presented for specific features, form the complete agreement
                            between you and us regarding the Services, unless a separate written
                            agreement governs.
                        </TermsItem>
                        <TermsItem>
                            If any provision of these Terms is held unenforceable, the remaining
                            provisions will remain in effect to the maximum extent permitted by law.
                        </TermsItem>
                        <TermsItem>
                            Our failure to enforce a provision is not a waiver of that provision.
                        </TermsItem>
                        <TermsItem>
                            You may not assign these Terms without our prior written consent, except
                            where assignment restrictions are prohibited by applicable law.
                        </TermsItem>
                    </TermsList>
                </TermsSection>

                <TermsSection number="21" title="Contact Us">
                    <p className="text-muted-foreground">
                        If you have questions, complaints, claims, or legal notices relating to the
                        Services or these Terms, contact:
                    </p>
                    <TermsList>
                        <TermsItem>
                            <strong>Operator</strong>: {COMPANY_NAME}
                        </TermsItem>
                        <TermsItem>
                            <strong>Website</strong>:{" "}
                            <ExternalLink href={APP_URL}>{APP_URL}</ExternalLink>
                        </TermsItem>
                        <TermsItem>
                            <strong>Legal contact email</strong>: <strong>TO-DO</strong>
                        </TermsItem>
                        <TermsItem>
                            <strong>Mailing address</strong>: <strong>TO-DO</strong>
                        </TermsItem>
                    </TermsList>
                </TermsSection>

                <p className="mt-12 text-muted-foreground text-sm">
                    By continuing to use {APP_NAME}, you acknowledge that you have read and agree to
                    these Terms, including any provisions marked <strong>TO-DO</strong> pending
                    final legal or operational review.
                </p>
            </div>
        </div>
    )
}

function TermsSection({
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

function TermsSubsection({
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

function TermsList({ children }: { children: ReactNode }) {
    return <ul className="list-disc space-y-2 pl-6 text-muted-foreground">{children}</ul>
}

function TermsItem({ children }: { children: ReactNode }) {
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
