/**
 * Imprenta Labs — Conector para Vektor POS
 * Proporciona impresión directa y silenciosa a impresoras térmicas
 */

const PORTS = [8765, 8766, 8767, 8768, 8769];

export interface PrinterStatusInfo {
  printer: string;
  state: 'ok' | 'offline' | 'paper_out' | 'cover_open' | 'paper_jam' | 'paused' | 'error' | 'not_found' | 'unreachable';
  online: boolean;
  warning?: string;
  detail?: string;
}

export interface TicketLine {
  t?: 'text' | 'cols' | 'line' | 'feed' | 'qr' | 'barcode' | 'cut' | 'drawer' | 'image';
  text?: string;
  left?: string;
  right?: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  underline?: boolean;
  size?: number;
  n?: number;
  data?: string;
  char?: string;
  dither?: boolean;
}

export class ImprentaLabsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private seq = 0;
  private connecting: Promise<this> | null = null;

  get isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  private _open(port: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`ws://127.0.0.1:${port}`);
      } catch (e) {
        return reject(e);
      }
      const timer = setTimeout(() => {
        try { ws.close(); } catch (_) {}
        reject(new Error('timeout'));
      }, 3000);

      ws.onopen = () => {
        clearTimeout(timer);
        resolve(ws);
      };
      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });
  }

  async connect(): Promise<this> {
    if (this.isConnected) return this;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      for (const port of PORTS) {
        try {
          const ws = await this._open(port);
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data);
              if (msg.event) return;
              const p = this.pending.get(msg.id);
              if (!p) return;
              this.pending.delete(msg.id);
              if (msg.error) {
                p.reject(new Error(msg.error));
              } else {
                p.resolve(msg.result);
              }
            } catch (err) {
              console.error('Error parseando mensaje WS:', err);
            }
          };

          ws.onclose = () => {
            this.ws = null;
            this.pending.forEach((p) => p.reject(new Error('Conexión cerrada')));
            this.pending.clear();
          };

          this.ws = ws;
          return this;
        } catch (_) {}
      }
      throw new Error('Imprenta Labs no disponible');
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async call<T = any>(call: string, params: any = {}): Promise<T> {
    await this.connect();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.ws!.send(JSON.stringify({ id, call, params }));
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  async getPrinters(): Promise<string[]> {
    return this.call<string[]>('printers.find');
  }

  async getDefaultPrinter(): Promise<string> {
    return this.call<string>('printers.getDefault');
  }

  async getPrinterStatus(printer?: string): Promise<PrinterStatusInfo> {
    return this.call<PrinterStatusInfo>('printers.status', { printer });
  }

  async printHTML(params: {
    printer?: string;
    html: string;
    widthDots?: number;
    cut?: boolean;
    openDrawer?: boolean;
  }): Promise<any> {
    return this.call('html', {
      printer: params.printer,
      html: params.html,
      widthDots: params.widthDots || 576,
      cut: params.cut !== false,
      openDrawer: !!params.openDrawer,
    });
  }

  async printTicket(params: {
    printer?: string;
    lines: TicketLine[];
    logo?: boolean;
    cut?: boolean;
    openDrawer?: boolean;
  }): Promise<any> {
    return this.call('ticket', {
      printer: params.printer,
      lines: params.lines,
      logo: params.logo !== false,
      cut: params.cut !== false,
      openDrawer: !!params.openDrawer,
    });
  }

  async openDrawer(printer?: string): Promise<any> {
    return this.call('openDrawer', { printer });
  }
}

export const imprentaLabs = new ImprentaLabsClient();
