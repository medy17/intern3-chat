"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"

const SWARM_CONFIG = {
    baseParticleSpacing: 16,
    useThemeColors: true
}

export interface SwarmFlakesDemoProps {
    className?: string
    speed?: number
    particleSpacing?: number
    pulseSpeed?: number // MULTIPLIER: 1.0 is default, 0.5 is half-speed expansion
    pulseWidth?: number // MULTIPLIER: 1.0 is default, 2.0 means double thickness (lasts longer)
    pulseStrength?: number // MULTIPLIER: 1.0 is default, 2.0 lifts particles twice as high
}

export interface SwarmFlakesRef {
    triggerRipple: () => void
}

// 🎨 Bulletproof Canvas-based OKLCH to RGB Converter
function parseColorVarToRgb(cssVar: string): [number, number, number] | null {
    if (typeof window === "undefined") return null
    const val = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
    if (!val) return null

    const cvs = document.createElement("canvas")
    cvs.width = 1
    cvs.height = 1
    const ctx = cvs.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null

    const magic = "#123456"
    let validFormat = ""

    const formatsToTry = val.includes("(")
        ? [val]
        : [`oklch(${val})`, `hsl(${val})`, `hsl(${val.replace(/\s+/g, ", ")})`]

    for (const format of formatsToTry) {
        ctx.fillStyle = magic
        ctx.fillStyle = format
        if (ctx.fillStyle !== magic) {
            validFormat = format
            break
        }
    }

    if (!validFormat) return null

    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = validFormat
    ctx.fillRect(0, 0, 1, 1)
    const data = ctx.getImageData(0, 0, 1, 1).data

    return [data[0], data[1], data[2]]
}

const VERTEX_SHADER_SRC = `#version 300 es
in vec2 a_quadPos;
in vec2 a_instancePos;
in float a_rotOffset;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_spacing; 

struct Ripple {
    float radius;
    float width;
    float strength;
};
uniform Ripple u_ripples[10];
uniform int u_numRipples;

out float v_z;
out vec2 v_screenPos;
out vec2 v_localPos;
out vec2 v_dir; 

void main() {
    vec2 center = u_resolution / 2.0;
    vec2 deltaCenter = a_instancePos - center;
    float distToCenter = length(deltaCenter);
    float angleFromCenter = atan(deltaCenter.y, deltaCenter.x);
    
    v_dir = distToCenter > 0.0 ? deltaCenter / distToCenter : vec2(0.0);
    
    float z = 0.0;
    
    for(int i = 0; i < 10; i++) {
        if (i >= u_numRipples) break;
        float diff = u_ripples[i].radius - distToCenter;
        if (diff > 0.0 && diff < u_ripples[i].width) {
            float normDiff = diff / u_ripples[i].width;
            z += sin(normDiff * 3.14159) * u_ripples[i].strength;
        }
    }
    
    vec2 deltaMouse = a_instancePos - u_mouse;
    float distSq = dot(deltaMouse, deltaMouse);
    if (distSq < 22500.0) { 
        float distToMouse = sqrt(distSq);
        z += cos((distToMouse / 150.0) * (3.14159 / 2.0)) * 0.8;
    }
    
    float ambientSpatial = distToCenter * 0.02;
    float ambientAngular = angleFromCenter * 8.0;
    float ambient = (sin(ambientSpatial - u_time * 1.5) + cos(ambientAngular + u_time * 0.5)) * 0.15;
    if (ambient > 0.0) z += ambient;
    
    z = max(0.0, z);
    v_z = z;
    v_screenPos = a_instancePos / u_resolution; 
    v_localPos = a_quadPos; 
    
    float perspectiveShift = z * 12.0;
    vec2 drawPos = a_instancePos + vec2(cos(angleFromCenter), sin(angleFromCenter)) * perspectiveShift;
    
    float maxDist = length(center);
    float distNormalized = clamp(distToCenter / maxDist, 0.0, 1.0);
    float sizeMultiplier = mix(0.4, 1.0, distNormalized); 

    float baseSize = max(2.0, u_spacing * 0.125);   
    float zScale = max(2.5, u_spacing * 0.15625);   
    float drawSize = (baseSize + (z * zScale)) * sizeMultiplier;
    
    float angle = a_rotOffset + z * 0.2;
    float c = cos(angle);
    float s = sin(angle);
    mat2 rot = mat2(c, -s, s, c);
    
    vec2 pos = drawPos + rot * (a_quadPos * drawSize);
    
    vec2 clipSpace = (pos / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0.0, 1.0);
}
`

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in float v_z;
in vec2 v_screenPos;
in vec2 v_localPos;
in vec2 v_dir; 

uniform vec3 u_primaryColor;
uniform vec3 u_accentColor;
uniform vec3 u_secondaryColor;
uniform vec3 u_tertiaryColor;
uniform float u_darkAlphaBoost;
uniform vec3 u_baseColor;
uniform float u_time; 

out vec4 fragColor;

void main() {
    float warpForce = v_z * 0.15; 
    float warpAngle = v_z * 0.8 - u_time * 1.5; 
    
    vec2 warpVector = vec2(
        v_dir.x * cos(warpAngle) - v_dir.y * sin(warpAngle),
        v_dir.x * sin(warpAngle) + v_dir.y * cos(warpAngle)
    ) * warpForce;

    float xRatio = v_screenPos.x + warpVector.x;
    float yRatio = v_screenPos.y + warpVector.y;
    
    vec3 targetColor = u_primaryColor;
    
    if (xRatio > 0.5) {
        if (yRatio < 0.5) {
            float blend = clamp((xRatio - 0.5) * 2.0, 0.0, 1.0);
            targetColor = mix(u_primaryColor, u_accentColor, blend);
        } else {
            float blend = clamp((xRatio - 0.5) * 2.0, 0.0, 1.0);
            targetColor = mix(u_primaryColor, u_secondaryColor, blend);
            
            if (yRatio < 0.8 && yRatio > 0.2) {
                float purpleBlend = clamp(1.0 - abs(yRatio - 0.5) * 2.0, 0.0, 1.0);
                targetColor = mix(targetColor, u_tertiaryColor, purpleBlend);
            }
        }
    }
    
    float clampedZ = (v_z > 2.0) ? 1.0 : (v_z * 0.5);
    vec3 finalColor = mix(u_baseColor, targetColor, clampedZ);
    
    float alphaBase = (0.1 + min(clampedZ * 0.6, 0.35)) * u_darkAlphaBoost;
    
    float maxDist = max(abs(v_localPos.x), abs(v_localPos.y)); 
    bool isBorder = maxDist > 0.42 && v_z > 0.05; 
    
    if (v_z < 0.05) {
        fragColor = vec4(u_baseColor, 0.15 * u_darkAlphaBoost);
    } else {
        if (isBorder) {
            fragColor = vec4(finalColor, alphaBase * 0.8);
        } else {
            fragColor = vec4(finalColor, alphaBase * 0.1);
        }
    }
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type)
    if (!shader) throw new Error("Could not create shader")
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        throw new Error("Shader compile error")
    }
    return shader
}

const SwarmFlakesDemoWebGL = forwardRef<SwarmFlakesRef, SwarmFlakesDemoProps>(
    (
        {
            className = "",
            speed = 0.8,
            particleSpacing = SWARM_CONFIG.baseParticleSpacing,
            pulseSpeed = 1.0,
            pulseWidth = 1.0,
            pulseStrength = 1.0
        },
        ref
    ) => {
        const canvasRef = useRef<HTMLCanvasElement>(null)
        const ripplesRef = useRef<
            { radius: number; baseSpeed: number; width: number; strength: number }[]
        >([])

        // Storing prop configs in refs to avoid restarting WebGL context on change
        const speedRef = useRef(speed)
        const configRef = useRef({ pulseSpeed, pulseWidth, pulseStrength })

        useEffect(() => {
            speedRef.current = speed
        }, [speed])
        useEffect(() => {
            configRef.current = { pulseSpeed, pulseWidth, pulseStrength }
        }, [pulseSpeed, pulseWidth, pulseStrength])

        const colorsRef = useRef({
            primary: [59, 130, 246],
            accent: [236, 72, 153],
            secondary: [34, 211, 238],
            tertiary: [168, 85, 247]
        })

        const currentSpacingRef = useRef(particleSpacing)

        const spawnRipple = () => {
            const { pulseSpeed: ps, pulseWidth: pw, pulseStrength: pst } = configRef.current

            ripplesRef.current.push({
                radius: 0,
                baseSpeed: (4 + Math.random() * 3) * ps,
                width: (350 + Math.random() * 250) * pw,
                strength: (1.2 + Math.random() * 1.5) * pst
            })
        }

        useEffect(() => {
            const updateColors = () => {
                if (!SWARM_CONFIG.useThemeColors) return

                const p = parseColorVarToRgb("--primary")
                const a = parseColorVarToRgb("--accent")
                const s = parseColorVarToRgb("--secondary")
                const t =
                    parseColorVarToRgb("--muted-foreground") || parseColorVarToRgb("--tertiary")

                colorsRef.current = {
                    primary: p || colorsRef.current.primary,
                    accent: a || colorsRef.current.accent,
                    secondary: s || colorsRef.current.secondary,
                    tertiary: t || colorsRef.current.tertiary
                }
            }

            updateColors()
            const timeouts = [setTimeout(updateColors, 100), setTimeout(updateColors, 500)]

            const themeObserver = new MutationObserver(updateColors)
            themeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ["class", "data-theme", "style"]
            })

            const canvas = canvasRef.current
            if (!canvas) return
            const gl = canvas.getContext("webgl2", { alpha: true, antialias: true })
            if (!gl) {
                console.error("WebGL 2 not supported")
                return
            }

            gl.enable(gl.BLEND)
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

            const program = gl.createProgram()!
            gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC))
            gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC))
            gl.linkProgram(program)
            gl.useProgram(program)

            const locRes = gl.getUniformLocation(program, "u_resolution")
            const locTime = gl.getUniformLocation(program, "u_time")
            const locMouse = gl.getUniformLocation(program, "u_mouse")
            const locNumRipples = gl.getUniformLocation(program, "u_numRipples")
            const locSpacing = gl.getUniformLocation(program, "u_spacing")

            const colorLocs = {
                primary: gl.getUniformLocation(program, "u_primaryColor"),
                accent: gl.getUniformLocation(program, "u_accentColor"),
                secondary: gl.getUniformLocation(program, "u_secondaryColor"),
                tertiary: gl.getUniformLocation(program, "u_tertiaryColor"),
                base: gl.getUniformLocation(program, "u_baseColor"),
                boost: gl.getUniformLocation(program, "u_darkAlphaBoost")
            }

            const quadVertices = new Float32Array([
                -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5
            ])
            const quadBuffer = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
            gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW)

            const locQuadPos = gl.getAttribLocation(program, "a_quadPos")
            gl.enableVertexAttribArray(locQuadPos)
            gl.vertexAttribPointer(locQuadPos, 2, gl.FLOAT, false, 0, 0)

            let instanceCount = 0
            const instanceBuffer = gl.createBuffer()

            let mouseX = -10000
            let mouseY = -10000
            let animationFrameId: number
            let width = 0
            let height = 0

            const generateParticles = (w: number, h: number) => {
                const spacing = w < 768 ? Math.max(20, particleSpacing) : particleSpacing
                currentSpacingRef.current = spacing

                const centerX = w / 2
                const centerY = h / 2
                const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY) + 150

                const donutGap = 110
                const layersPerDonut = 4
                const layerSpacing = 14

                const data: number[] = []

                const addRing = (r: number, offset = 0) => {
                    if (r === 0) {
                        data.push(centerX, centerY, (Math.random() - 0.5) * 0.2)
                        return
                    }
                    const numParticles = Math.floor((2 * Math.PI * r) / spacing)
                    for (let i = 0; i < numParticles; i++) {
                        const angle = offset + (i / numParticles) * Math.PI * 2
                        data.push(
                            centerX + Math.cos(angle) * r,
                            centerY + Math.sin(angle) * r,
                            (Math.random() - 0.5) * 0.2
                        )
                    }
                }

                for (let layer = 0; layer < layersPerDonut; layer++) addRing(layer * layerSpacing)

                for (let donutBaseR = donutGap; donutBaseR < maxRadius; donutBaseR += donutGap) {
                    for (let layer = 0; layer < layersPerDonut; layer++) {
                        const r = donutBaseR + layer * layerSpacing
                        const numParticles = Math.floor((2 * Math.PI * r) / spacing)
                        addRing(r, layer % 2 === 0 ? 0 : Math.PI / numParticles)
                    }
                }

                const instanceData = new Float32Array(data)
                instanceCount = instanceData.length / 3

                gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
                gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.STATIC_DRAW)

                const locInstancePos = gl.getAttribLocation(program, "a_instancePos")
                const locRotOffset = gl.getAttribLocation(program, "a_rotOffset")

                gl.enableVertexAttribArray(locInstancePos)
                gl.vertexAttribPointer(locInstancePos, 2, gl.FLOAT, false, 12, 0)
                gl.vertexAttribDivisor(locInstancePos, 1)

                gl.enableVertexAttribArray(locRotOffset)
                gl.vertexAttribPointer(locRotOffset, 1, gl.FLOAT, false, 12, 8)
                gl.vertexAttribDivisor(locRotOffset, 1)
            }

            const hexToColor = (hexArray: number[]) => hexArray.map((c) => c / 255)

            let lastTime = performance.now()
            let accumulatedTime = 0

            const render = (currentTime: number) => {
                const currentSpeed = speedRef.current ?? 1.0

                let deltaTime = currentTime - lastTime
                lastTime = currentTime

                if (deltaTime > 30) deltaTime = 30

                const timeScale = deltaTime / 16.666
                accumulatedTime += deltaTime * currentSpeed
                const shaderTime = accumulatedTime * 0.001

                gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
                gl.clearColor(0, 0, 0, 0)
                gl.clear(gl.COLOR_BUFFER_BIT)

                gl.useProgram(program)
                gl.uniform1f(locTime, shaderTime)
                gl.uniform2f(locMouse, mouseX, mouseY)
                gl.uniform1f(locSpacing, currentSpacingRef.current)

                const ripples = ripplesRef.current
                for (let i = ripples.length - 1; i >= 0; i--) {
                    ripples[i].radius += ripples[i].baseSpeed * currentSpeed * timeScale

                    if (ripples[i].radius - ripples[i].width > 3000) {
                        ripples.splice(i, 1)
                    }
                }

                const numRipples = Math.min(ripples.length, 10)
                gl.uniform1i(locNumRipples, numRipples)

                for (let i = 0; i < numRipples; i++) {
                    gl.uniform1f(
                        gl.getUniformLocation(program, `u_ripples[${i}].radius`),
                        ripples[i].radius
                    )
                    gl.uniform1f(
                        gl.getUniformLocation(program, `u_ripples[${i}].width`),
                        ripples[i].width
                    )
                    gl.uniform1f(
                        gl.getUniformLocation(program, `u_ripples[${i}].strength`),
                        ripples[i].strength
                    )
                }

                const isDark =
                    document.documentElement.classList.contains("dark") ||
                    document.documentElement.getAttribute("data-theme") === "dark"

                const c = colorsRef.current
                gl.uniform3fv(colorLocs.primary, hexToColor(c.primary))
                gl.uniform3fv(colorLocs.accent, hexToColor(c.accent))
                gl.uniform3fv(colorLocs.secondary, hexToColor(c.secondary))
                gl.uniform3fv(colorLocs.tertiary, hexToColor(c.tertiary))
                gl.uniform3fv(
                    colorLocs.base,
                    hexToColor(isDark ? [161, 161, 170] : [203, 213, 225])
                )
                gl.uniform1f(colorLocs.boost, isDark ? 2.0 : 1.0)

                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instanceCount)

                animationFrameId = requestAnimationFrame(render)
            }

            const resize = () => {
                const parent = canvas.parentElement
                width = parent ? parent.clientWidth : window.innerWidth
                height = parent ? parent.clientHeight : window.innerHeight
                const dpr = window.devicePixelRatio || 1

                canvas.width = width * dpr
                canvas.height = height * dpr

                gl.useProgram(program)
                gl.uniform2f(locRes, width, height)

                generateParticles(width, height)
            }

            const updateMouse = (x: number, y: number) => {
                const rect = canvas.getBoundingClientRect()
                mouseX = x - rect.left
                mouseY = y - rect.top
            }
            const onMouseMove = (e: MouseEvent) => updateMouse(e.clientX, e.clientY)
            const onTouchMove = (e: TouchEvent) =>
                updateMouse(e.touches[0].clientX, e.touches[0].clientY)

            window.addEventListener("resize", resize)
            canvas.addEventListener("mousemove", onMouseMove)
            canvas.addEventListener("touchmove", onTouchMove)
            canvas.addEventListener("mouseleave", () => {
                mouseX = -10000
                mouseY = -10000
            })

            resize()
            animationFrameId = requestAnimationFrame(render)

            return () => {
                timeouts.forEach(clearTimeout)
                themeObserver.disconnect()
                window.removeEventListener("resize", resize)
                canvas.removeEventListener("mousemove", onMouseMove)
                canvas.removeEventListener("touchmove", onTouchMove)
                cancelAnimationFrame(animationFrameId)
                gl.deleteProgram(program)
            }
        }, [particleSpacing])

        useImperativeHandle(ref, () => ({ triggerRipple: spawnRipple }))

        return (
            <canvas
                ref={canvasRef}
                className={`block h-full w-full ${className}`}
                style={{ touchAction: "none" }}
            />
        )
    }
)

export default SwarmFlakesDemoWebGL
