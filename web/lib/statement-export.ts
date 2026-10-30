export interface StatementData {
    profile: {
        full_name: string;
        username: string;
        mobile_number: string;
        city: string;
        status: string;
        created_at: string;
    };
    deposits: Array<Record<string, unknown>>;
    payouts: Array<Record<string, unknown>>;
    withdrawals: Array<Record<string, unknown>>;
    returns?: Array<Record<string, unknown>>;
    generatedAt?: string;
    summary: {
        totalDeposited: number;
        totalPayouts: number;
        totalWithdrawn: number;
        totalWithdrawalFees?: number;
        totalReturnedPrincipal?: number;
    };
}
export type StatementFormat = "pdf" | "word" | "png";
const WIDTH = 1240, HEIGHT = 1754, LEFT = 50, RIGHT = 1190, BOTTOM = 1590;
const pageDescriptions = new WeakMap<HTMLCanvasElement, string[]>();
export function statementMoney(value: unknown) {
    return value == null || !Number.isFinite(Number(value)) ? "—" : "Rs " + Number(value).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statementDate(value: unknown) {
    if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime()))
        return "—";
    return new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" });
}
export function statementFilename(data: StatementData) {
    return "TDX-Statement-" + (data.profile.username || "member").replace(/[^a-zA-Z0-9._-]/g, "_");
}
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Statement image could not be prepared")), "image/png"));
}
/** One page at a time keeps large statements from retaining giant canvases. */
export async function* renderStatementPages(data: StatementData, language: string): AsyncGenerator<HTMLCanvasElement> {
    const logo = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const timer = setTimeout(() => reject(new Error("TDX logo timed out")), 15000);
        image.onload = () => { clearTimeout(timer); resolve(image); };
        image.onerror = () => { clearTimeout(timer); reject(new Error("TDX logo could not be loaded")); };
        image.src = "/Logo.jpg";
    });
    const ur = language === "ur", green = "#173e33", muted = "#64746e";
    const generated = statementDate(data.generatedAt ?? new Date().toISOString());
    let canvas!: HTMLCanvasElement, ctx!: CanvasRenderingContext2D, page = 0, y = 0;
    const text = (value: string, x: number, baseline: number, width: number, size = 22, bold = false, color = "#18372e", align: CanvasTextAlign = "left") => {
        pageDescriptions.get(canvas)?.push(value);
        ctx.direction = ur && /[\u0600-\u06ff]/.test(value) ? "rtl" : "ltr";
        ctx.textAlign = align;
        ctx.fillStyle = color;
        let font = size;
        ctx.font = `${bold ? "bold " : ""}${font}px Arial, sans-serif`;
        while (ctx.measureText(value).width > width && font > 12) {
            font--;
            ctx.font = `${bold ? "bold " : ""}${font}px Arial, sans-serif`;
        }
        let fitted = value;
        while (ctx.measureText(fitted).width > width && fitted.length > 1)
            fitted = fitted.slice(0, -2) + "…";
        ctx.fillText(fitted, x, baseline, width);
    };
    const newPage = () => {
        canvas = document.createElement("canvas");
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        pageDescriptions.set(canvas, []);
        const context = canvas.getContext("2d");
        if (!context)
            throw new Error("Canvas is unavailable");
        ctx = context;
        page++;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = green;
        ctx.fillRect(0, 0, WIDTH, 205);
        ctx.drawImage(logo, LEFT, 42, 115, 115);
        text("TDX INVESTMENT", 200, 91, 940, 38, true, "#fff");
        text(ur ? "سرمایہ کاری کا گوشوارہ" : "INVESTMENT STATEMENT", 200, 143, 940, 25, false, "#d9e6df");
        text((ur ? "تیاری کی تاریخ: " : "Generated: ") + generated, LEFT, 1661, 800, 19, false, muted);
        text("TDX • 0308-3958294", LEFT, 1701, 900, 21, true, green);
        text((ur ? "صفحہ " : "Page ") + page, RIGHT, 1701, 230, 20, false, muted, "right");
        y = 245;
    };
    newPage();
    text(data.profile.full_name || data.profile.username, LEFT, y + 13, 1140, 30, true);
    text("@" + data.profile.username + "  •  " + (data.profile.mobile_number || "—") + "  •  " + (data.profile.city || "—"), LEFT, y + 55, 1140, 21, false, muted);
    const cards = [[(ur ? "منظور شدہ جمع رقم" : "APPROVED DEPOSITS"), data.summary.totalDeposited], [(ur ? "ادا شدہ مجموعی منافع" : "PAID PROFIT (GROSS)"), data.summary.totalPayouts], [(ur ? "خالص ادا شدہ نکاسی" : "WITHDRAWALS (NET)"), data.summary.totalWithdrawn]] as const;
    cards.forEach(([label, value], index) => {
        const x = LEFT + index * 385;
        ctx.fillStyle = "#eef4f0";
        ctx.fillRect(x, y + 85, 370, 112);
        text(label, x + 15, y + 119, 340, 18, true, muted);
        text(statementMoney(value), x + 15, y + 164, 340, 30, true);
    });
    if (data.summary.totalWithdrawalFees != null)
        text((ur ? "کل نکاسی فیس: " : "Withdrawal fees: ") + statementMoney(data.summary.totalWithdrawalFees), LEFT, y + 223, 1140, 19, false, muted);
    y += 236;
    if (data.summary.totalReturnedPrincipal != null) {
        text((ur ? "واپس شدہ اصل سرمایہ: " : "Principal returned: ") + statementMoney(data.summary.totalReturnedPrincipal), LEFT, y + 12, 1140, 19, false, muted);
        y += 39;
    }
    const status = (value: unknown) => {
        const raw = String(value ?? "—");
        return ur ? ({ approved: "منظور شدہ", pending: "زیر التوا", completed: "مکمل", paid: "ادا شدہ", rejected: "مسترد", requested: "درخواست" } as Record<string, string>)[raw] ?? raw : raw;
    };
    type Section = {
        title: string;
        widths: number[];
        head: string[];
        rows: string[][];
    };
    const sections: Section[] = [
        { title: ur ? "جمع شدہ رقوم" : "DEPOSITS", widths: [220, 180, 230, 510], head: ur ? ["رقم", "حالت", "تاریخ", "حوالہ"] : ["Amount", "Status", "Date", "Reference"], rows: data.deposits.map(row => [statementMoney(row.amount), status(row.status), statementDate(row.created_at), String(row.id ?? "—")]) },
        { title: ur ? "ماہانہ منافع کے ریکارڈ" : "PROFIT RECORDS (GROSS)", widths: [180, 100, 150, 170, 200, 340], head: ur ? ["مجموعی منافع", "شرح", "مدت", "حالت", "تاریخ", "حوالہ"] : ["Gross", "Rate", "Period", "Status", "Date", "Reference"], rows: data.payouts.map(row => [statementMoney(row.amount), row.percentage_applied == null ? "—" : String(row.percentage_applied) + "%", row.month && row.year ? String(row.month).padStart(2, "0") + "/" + row.year : "—", status(row.status), statementDate(row.created_at), String(row.id ?? "—")]) },
        { title: ur ? "منافع کی نکاسی" : "PROFIT WITHDRAWALS", widths: [170, 110, 170, 160, 190, 340], head: ur ? ["مجموعی رقم", "فیس", "خالص ادا شدہ", "حالت", "تاریخ", "حوالہ"] : ["Gross", "Fee", "Net", "Status", "Date", "Reference"], rows: data.withdrawals.map(row => [statementMoney(row.amount), statementMoney(row.fee), statementMoney(row.net_amount), status(row.status), statementDate(row.processed_at ?? row.created_at), String(row.id ?? "—")]) },
        { title: ur ? "اصل سرمایہ کی واپسی" : "PRINCIPAL RETURNS", widths: [220,220,180,180,340], head: ur ? ["درخواست کی رقم","واپس شدہ رقم","حالت","تاریخ","حوالہ"] : ["Requested","Returned","Status","Date","Reference"], rows: (data.returns ?? []).map(row => [statementMoney(row.amount),statementMoney(row.returned_amount ?? (row.status === "completed" ? row.amount : null)),status(row.status),statementDate(row.completed_at ?? row.created_at),String(row.id ?? "—")]) },
    ];
    const heading = (section: Section) => {
        text(section.title, LEFT, y + 25, 1140, 24, true);
        y += 43;
        ctx.fillStyle = green;
        ctx.fillRect(LEFT, y, 1140, 38);
        let x = LEFT;
        section.head.forEach((label, index) => {
            text(label, x + 10, y + 26, section.widths[index] - 20, 18, true, "#fff");
            x += section.widths[index];
        });
        y += 38;
    };
    for (const section of sections) {
        if (y + 130 > BOTTOM) {
            yield canvas;
            newPage();
        }
        heading(section);
        const rows = section.rows.length ? section.rows : [[ur ? "کوئی ریکارڈ موجود نہیں" : "No records"]];
        for (let index = 0; index < rows.length; index++) {
            if (y + 43 > BOTTOM) {
                yield canvas;
                newPage();
                heading(section);
            }
            ctx.fillStyle = index % 2 === 0 ? "#f2f6f3" : "#fff";
            ctx.fillRect(LEFT, y, 1140, 43);
            let x = LEFT;
            rows[index].forEach((value, column) => {
                text(value, x + 10, y + 28, (section.widths[column] ?? 1140) - 20, 19);
                x += section.widths[column] ?? 1140;
            });
            y += 43;
        }
        y += 28;
    }
    yield canvas;
}
export async function statementExport(data: StatementData, language: string, format: StatementFormat): Promise<{
    blob: Blob;
    filename: string;
}> {
    const name = statementFilename(data);
    if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ compress: true });
        let count = 0;
        for await (const canvas of renderStatementPages(data, language)) {
            if (count++)
                pdf.addPage();
            pdf.addImage(new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()), "PNG", 0, 0, 210, 297, undefined, "FAST");
            canvas.width = canvas.height = 1;
        }
        return { blob: pdf.output("blob"), filename: name + ".pdf" };
    }
    const images: Uint8Array[] = [], descriptions: string[] = [];
    for await (const canvas of renderStatementPages(data, language)) {
        images.push(new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()));
        descriptions.push((pageDescriptions.get(canvas) ?? []).join("\n"));
        canvas.width = canvas.height = 1;
    }
    if (format === "word") {
        const { Document, Packer, Paragraph, ImageRun } = await import("docx");
        const document = new Document({ sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 600, right: 600, bottom: 600, left: 600 } } }, children: images.map((bytes, index) => new Paragraph({ pageBreakBefore: index > 0, children: [new ImageRun({ type: "png", data: bytes, transformation: { width: 640, height: 906 }, altText: { title: "TDX Investment Statement", description: descriptions[index], name: "Statement page " + (index + 1) } })] })) }] });
        return { blob: await Packer.toBlob(document), filename: name + ".docx" };
    }
    if (images.length === 1)
        return { blob: new Blob([images[0] as BlobPart], { type: "image/png" }), filename: name + ".png" };
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    images.forEach((bytes, index) => zip.file("page-" + String(index + 1).padStart(3, "0") + ".png", bytes));
    return { blob: await zip.generateAsync({ type: "blob", compression: "STORE" }), filename: name + "-PNG-pages.zip" };
}
