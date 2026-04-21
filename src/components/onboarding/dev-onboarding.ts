export const DEV_OPEN_ONBOARDING_EVENT = "intern3:open-onboarding"

export function openDevOnboarding() {
    document.dispatchEvent(new CustomEvent(DEV_OPEN_ONBOARDING_EVENT))
}
