function encodeBase64Url(str: string): string {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(str)
    let binary = ""
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ""
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
    const b64Lines = pem
        .replace(/-{5}(BEGIN|END) (PRIVATE|PUBLIC) KEY-{5}/g, "")
        .replace(/\s+/g, "")
    const binary = atob(b64Lines)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }

    return await crypto.subtle.importKey(
        "pkcs8",
        bytes.buffer,
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256"
        },
        false,
        ["sign"]
    )
}

export async function getGoogleAccessToken(
    clientEmail: string,
    privateKey: string,
    scopes: string[] = ["https://www.googleapis.com/auth/cloud-platform"]
): Promise<string> {
    const header = {
        alg: "RS256",
        typ: "JWT"
    }

    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 3600 // 1 hour

    const payload = {
        iss: clientEmail,
        sub: clientEmail,
        aud: "https://oauth2.googleapis.com/token",
        iat,
        exp,
        scope: scopes.join(" ")
    }

    const encodedHeader = encodeBase64Url(JSON.stringify(header))
    const encodedPayload = encodeBase64Url(JSON.stringify(payload))

    const unsignedToken = `${encodedHeader}.${encodedPayload}`

    const key = await importPrivateKey(privateKey)
    const signatureBuffer = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(unsignedToken)
    )

    const signature = bufferToBase64Url(signatureBuffer)
    const jwt = `${unsignedToken}.${signature}`

    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt
        })
    })

    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Failed to fetch Google Access Token: ${err}`)
    }

    const data = (await res.json()) as { access_token: string }
    return data.access_token
}
