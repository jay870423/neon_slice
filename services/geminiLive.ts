import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';

// Define the tool for the model to call when it sees a gesture
const gestureTool: FunctionDeclaration = {
  name: 'detectGesture',
  description: 'Trigger when the user activates the left or right side via hand, head, or eye movement.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      side: {
        type: Type.STRING,
        enum: ['left', 'right'],
        description: 'The side (left/right) activated by the user.',
      },
    },
    required: ['side'],
  },
};

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private onGesture: (side: 'left' | 'right') => void;
  private onStatusChange: (status: string) => void;

  constructor(onGesture: (side: 'left' | 'right') => void, onStatusChange: (status: string) => void) {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.onGesture = onGesture;
    this.onStatusChange = onStatusChange;
  }

  async connect() {
    this.onStatusChange('Initializing Vision...');
    
    this.sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: () => {
          this.onStatusChange('Vision Active! Use Hands, Head, or Eyes.');
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              if (fc.name === 'detectGesture') {
                const side = (fc.args as any).side;
                if (side === 'left' || side === 'right') {
                  this.onGesture(side);
                }
                
                // Keep session alive with minimal response
                if (this.sessionPromise) {
                   this.sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: {
                          id: fc.id,
                          name: fc.name,
                          response: { result: "ok" }
                        }
                      });
                   });
                }
              }
            }
          }
        },
        onerror: (e) => {
          console.error("Gemini Error:", e);
          this.onStatusChange('Connection Error. Try restarting.');
        },
        onclose: () => {
          this.onStatusChange('Disconnected.');
        }
      },
      config: {
        responseModalities: [Modality.AUDIO], 
        systemInstruction: `
          You are a multimodal game controller.
          
          INPUT: Continuous video stream of a user.
          SPLIT: 
          - LEFT HALF (0-50% width)
          - RIGHT HALF (50-100% width)

          TRIGGERS:
          Trigger 'detectGesture' with side='left' OR side='right' if ANY of these happen:
          
          1. HANDS/FINGERS: User raises hand, points, or slices in that zone.
          2. HEAD MOVEMENT: User TILTS head significantly towards that side.
          3. EYE GAZE: User looks sharply towards that side.
          4. BODY LEAN: User leans their body into that zone.

          PRIORITY:
          - Speed is critical. React immediately.
          - Prioritize HANDS, then HEAD.
          - IGNORE audio input. DO NOT speak.
        `,
        tools: [{ functionDeclarations: [gestureTool] }],
      },
    });

    await this.sessionPromise;
  }

  async sendFrame(base64Image: string) {
    if (!this.sessionPromise) return;

    this.sessionPromise.then((session) => {
      session.sendRealtimeInput({
        media: {
          mimeType: 'image/jpeg',
          data: base64Image
        }
      });
    });
  }

  async disconnect() {
    this.sessionPromise = null;
  }
}