import type { TaskEvent } from "../../core/events.js";
export interface FeishuTextPayload {
    msg_type: "text";
    content: {
        text: string;
    };
}
/** Render a bounded text message without making Feishu part of the core model. */
export declare function renderFeishuText(event: TaskEvent): string;
export declare function renderFeishuPayload(event: TaskEvent): FeishuTextPayload;
//# sourceMappingURL=renderer.d.ts.map