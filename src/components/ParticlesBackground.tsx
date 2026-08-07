import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface PulseRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  active: boolean;
}

interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  colorStr: string;
}

export const ParticlesBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    let pulseRings: PulseRing[] = [];
    let orbs: Orb[] = [];
    let scanLineY = 0;
    
    // Config
    const PARTICLE_COUNT = 150; // Increased
    const MAX_DISTANCE = 140; // Increased connection distance
    const MAX_LINE_ALPHA = 0.12; // Increased max alpha
    
    // Colors
    const COLORS = [
      '6, 182, 212',   // Cyan
      '99, 102, 241',  // Indigo
      '139, 92, 246',  // Violet
      '236, 72, 153',  // Magenta
    ];

    const ORB_COLORS = [
      'rgba(99, 102, 241, 0.06)',
      'rgba(6, 182, 212, 0.05)',
      'rgba(139, 92, 246, 0.04)',
      'rgba(236, 72, 153, 0.05)'
    ];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      init();
    };

    const init = () => {
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.8,
          vy: (Math.random() - 0.5) * 0.8,
          radius: Math.random() * 2.5 + 0.5,
          color: COLORS[Math.floor(Math.random() * COLORS.length)]
        });
      }

      orbs = [];
      for (let i = 0; i < 4; i++) {
        orbs.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          radius: Math.random() * 70 + 80, // 80-150px
          colorStr: ORB_COLORS[i % ORB_COLORS.length]
        });
      }
      
      pulseRings = [];
      scanLineY = 0;
    };

    let lastPulseTime = 0;

    const drawGrid = () => {
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.03)';
      ctx.lineWidth = 1;
      const spacing = 80;
      
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x += spacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
      }
      for (let y = 0; y < canvas.height; y += spacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
      }
      ctx.stroke();
    };

    const drawOrbs = () => {
      orbs.forEach(orb => {
        orb.x += orb.vx;
        orb.y += orb.vy;

        if (orb.x < -orb.radius) orb.x = canvas.width + orb.radius;
        if (orb.x > canvas.width + orb.radius) orb.x = -orb.radius;
        if (orb.y < -orb.radius) orb.y = canvas.height + orb.radius;
        if (orb.y > canvas.height + orb.radius) orb.y = -orb.radius;

        const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
        gradient.addColorStop(0, orb.colorStr);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });
    };

    const drawScanLine = () => {
      scanLineY += (canvas.height / (8 * 60)); // ~8 seconds for full pass at 60fps
      if (scanLineY > canvas.height) {
        scanLineY = 0;
      }

      ctx.fillStyle = 'rgba(99, 102, 241, 0.06)';
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(99, 102, 241, 0.5)';
      ctx.fillRect(0, scanLineY, canvas.width, 2);
      ctx.shadowBlur = 0;
    };

    const updateAndDrawPulseRings = (time: number) => {
      if (time - lastPulseTime > 3000 && pulseRings.filter(r => r.active).length < 3) {
        pulseRings.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: 10,
          maxRadius: Math.random() * 150 + 100,
          alpha: 0.3,
          active: true
        });
        lastPulseTime = time;
      }

      pulseRings.forEach(ring => {
        if (!ring.active) return;

        ring.radius += 1.5;
        ring.alpha -= 0.002;

        if (ring.alpha <= 0 || ring.radius >= ring.maxRadius) {
          ring.active = false;
          return;
        }

        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(6, 182, 212, ${Math.max(0, ring.alpha)})`; // Cyan pulse
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      pulseRings = pulseRings.filter(r => r.active);
    };

    const drawParticles = () => {
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color}, ${Math.random() * 0.4 + 0.4})`;
        
        if (p.radius > 2) {
            ctx.shadowBlur = p.radius * 3;
            ctx.shadowColor = `rgba(${p.color}, 0.8)`;
        } else {
            ctx.shadowBlur = 0;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0; // reset
      });
    };

    const drawConstellations = () => {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < MAX_DISTANCE) {
            const opacity = (1 - distance / MAX_DISTANCE) * MAX_LINE_ALPHA;
            
            const gradient = ctx.createLinearGradient(
                particles[i].x, particles[i].y, 
                particles[j].x, particles[j].y
            );
            gradient.addColorStop(0, `rgba(${particles[i].color}, ${opacity})`);
            gradient.addColorStop(1, `rgba(${particles[j].color}, ${opacity})`);

            ctx.beginPath();
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 1;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
    };

    const render = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawGrid();
      drawOrbs();
      drawScanLine();
      updateAndDrawPulseRings(time);
      drawConstellations();
      drawParticles();

      animationFrameId = requestAnimationFrame(render);
    };

    window.addEventListener('resize', resize);
    resize();
    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-40 mix-blend-screen"
    />
  );
};
