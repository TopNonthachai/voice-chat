import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream;
  isMuted: boolean;
  height?: number;
  onSpeaking?: (isSpeaking: boolean) => void;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, isMuted, height = 40, onSpeaking }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!canvasRef.current || !stream || isMuted) {
        // Clear canvas if muted
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        onSpeaking?.(false);
        return;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    
    source.connect(analyser);
    analyser.fftSize = 64;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    let lastSpeakingState = false;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      // Detect speaking
      const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
      const isSpeaking = average > 15; // Threshold for speaking

      if (isSpeaking !== lastSpeakingState) {
        lastSpeakingState = isSpeaking;
        onSpeaking?.(isSpeaking);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        ctx.fillStyle = '#5865F2'; // Discord Blurple
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audioContext.close();
    };
  }, [stream, isMuted]);

  return (
    <canvas 
      ref={canvasRef} 
      width={100} 
      height={height} 
      className="w-full h-full"
    />
  );
};

export default AudioVisualizer;