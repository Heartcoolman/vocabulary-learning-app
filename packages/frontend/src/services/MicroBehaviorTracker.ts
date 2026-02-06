import type {
  MicroInteractionData,
  TrajectoryPoint,
  HoverEvent,
  KeystrokeEvent,
} from '@danci/shared';

const SAMPLE_INTERVAL_MS = 50;
const MAX_TRAJECTORY_POINTS = 500;
const MAX_HOVER_EVENTS = 100;
const MAX_KEYSTROKE_EVENTS = 50;
const TENTATIVE_HOVER_THRESHOLD_MS = 500;

export class MicroBehaviorTracker {
  private trajectoryPoints: TrajectoryPoint[] = [];
  private hoverEvents: HoverEvent[] = [];
  private keystrokeEvents: KeystrokeEvent[] = [];
  private tentativeSelections: Set<string> = new Set();

  private questionRenderTime = 0;
  private questionRenderEpochMs = 0;
  private firstInteractionTime: number | null = null;
  private containerRect: DOMRect | null = null;
  private lastSampleTime = 0;
  private currentHover: {
    optionId: string;
    enterTime: number;
    enterEpochMs: number;
  } | null = null;
  private pointerType: 'mouse' | 'touch' | 'pen' = 'mouse';
  private isTouchDevice = false;

  init(containerElement: HTMLElement): void {
    this.reset();
    this.questionRenderTime = performance.now();
    this.questionRenderEpochMs = Date.now();
    this.containerRect = containerElement.getBoundingClientRect();
  }

  reset(): void {
    this.trajectoryPoints = [];
    this.hoverEvents = [];
    this.keystrokeEvents = [];
    this.tentativeSelections.clear();
    this.firstInteractionTime = null;
    this.currentHover = null;
    this.lastSampleTime = 0;
    this.pointerType = 'mouse';
    this.isTouchDevice = false;
  }

  handlePointerMove(event: PointerEvent): void {
    this.pointerType = event.pointerType as 'mouse' | 'touch' | 'pen';
    if (event.pointerType === 'touch') {
      this.isTouchDevice = true;
      return;
    }

    const now = performance.now();
    if (now - this.lastSampleTime < SAMPLE_INTERVAL_MS) {
      return;
    }

    this.recordFirstInteraction(now);
    this.lastSampleTime = now;

    if (this.containerRect) {
      const point: TrajectoryPoint = {
        x: event.clientX - this.containerRect.left,
        y: event.clientY - this.containerRect.top,
        t: Math.round(now - this.questionRenderTime),
        epochMs: Date.now(),
      };

      if (this.trajectoryPoints.length >= MAX_TRAJECTORY_POINTS) {
        this.trajectoryPoints.shift();
      }
      this.trajectoryPoints.push(point);
    }
  }

  handleOptionEnter(optionId: string, event?: PointerEvent): void {
    if (event?.pointerType === 'touch') {
      this.isTouchDevice = true;
      return;
    }

    const now = performance.now();
    this.recordFirstInteraction(now);

    if (this.currentHover) {
      this.finalizeHover(now);
    }

    this.currentHover = {
      optionId,
      enterTime: now - this.questionRenderTime,
      enterEpochMs: Date.now(),
    };
  }

  handleOptionLeave(): void {
    if (this.currentHover && !this.isTouchDevice) {
      this.finalizeHover(performance.now());
    }
  }

  handleKeyDown(key: string): void {
    const now = performance.now();
    this.recordFirstInteraction(now);

    const event: KeystrokeEvent = {
      key,
      downTime: Math.round(now - this.questionRenderTime),
      upTime: null,
      downEpochMs: Date.now(),
      upEpochMs: null,
    };

    if (this.keystrokeEvents.length >= MAX_KEYSTROKE_EVENTS) {
      this.keystrokeEvents.shift();
    }
    this.keystrokeEvents.push(event);
  }

  handleKeyUp(key: string): void {
    const now = performance.now();
    const event = this.keystrokeEvents.find((e) => e.key === key && e.upTime === null);
    if (event) {
      event.upTime = Math.round(now - this.questionRenderTime);
      event.upEpochMs = Date.now();
    }
  }

  getData(): MicroInteractionData {
    if (this.currentHover && !this.isTouchDevice) {
      this.finalizeHover(performance.now());
    }

    const trajectoryLength = this.calculateTrajectoryLength();
    const directDistance = this.calculateDirectDistance();
    const optionSwitchCount = this.calculateSwitchCount();

    return {
      pointerType: this.pointerType,
      trajectoryPoints: this.trajectoryPoints,
      hoverEvents: this.hoverEvents,
      tentativeSelections: Array.from(this.tentativeSelections),
      keystrokeEvents: this.keystrokeEvents,
      reactionLatencyMs: this.firstInteractionTime
        ? Math.round(this.firstInteractionTime - this.questionRenderTime)
        : null,
      trajectoryLength,
      directDistance,
      optionSwitchCount,
      questionRenderEpochMs: this.questionRenderEpochMs,
    };
  }

  private recordFirstInteraction(time: number): void {
    if (this.firstInteractionTime === null) {
      this.firstInteractionTime = time;
    }
  }

  private finalizeHover(endTime: number): void {
    if (!this.currentHover) return;

    const relativeEnd = Math.round(endTime - this.questionRenderTime);
    const duration = relativeEnd - this.currentHover.enterTime;

    const event: HoverEvent = {
      optionId: this.currentHover.optionId,
      enterTime: Math.round(this.currentHover.enterTime),
      leaveTime: relativeEnd,
      enterEpochMs: this.currentHover.enterEpochMs,
      leaveEpochMs: Date.now(),
    };

    if (this.hoverEvents.length >= MAX_HOVER_EVENTS) {
      this.hoverEvents.shift();
    }
    this.hoverEvents.push(event);

    if (duration >= TENTATIVE_HOVER_THRESHOLD_MS) {
      this.tentativeSelections.add(this.currentHover.optionId);
    }

    this.currentHover = null;
  }

  private calculateTrajectoryLength(): number {
    if (this.trajectoryPoints.length < 2) return 0;

    let length = 0;
    for (let i = 1; i < this.trajectoryPoints.length; i++) {
      const dx = this.trajectoryPoints[i].x - this.trajectoryPoints[i - 1].x;
      const dy = this.trajectoryPoints[i].y - this.trajectoryPoints[i - 1].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }
    return length;
  }

  private calculateDirectDistance(): number {
    if (this.trajectoryPoints.length < 2) return 0;

    const first = this.trajectoryPoints[0];
    const last = this.trajectoryPoints[this.trajectoryPoints.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private calculateSwitchCount(): number {
    if (this.hoverEvents.length < 2) return 0;

    let switches = 0;
    for (let i = 1; i < this.hoverEvents.length; i++) {
      if (this.hoverEvents[i].optionId !== this.hoverEvents[i - 1].optionId) {
        switches++;
      }
    }
    return switches;
  }
}

export const microBehaviorTracker = new MicroBehaviorTracker();
