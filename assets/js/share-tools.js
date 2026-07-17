(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OPEN_TENNIS_SHARE = Object.freeze(api);
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function parseTurnRange(turn) {
    const match = String(turn || "").match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
    if (!match) return { startHour: 12, startMinute: 0, endHour: 13, endMinute: 30 };
    return {
      startHour: Number(match[1]),
      startMinute: Number(match[2]),
      endHour: Number(match[3]),
      endMinute: Number(match[4])
    };
  }

  function withTime(date, hour, minute) {
    const value = date instanceof Date && !Number.isNaN(date.getTime()) ? new Date(date) : new Date();
    value.setHours(hour, minute, 0, 0);
    return value;
  }

  function calendarTimestamp(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
  }

  function escapeCalendar(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function matchTitle(match, player) {
    const opponent = match?.opponent || "Rival por confirmar";
    return `${player} vs ${opponent}`;
  }

  function buildCalendar(match, player) {
    if (!match || !player) return "";
    const range = parseTurnRange(match.turn);
    const start = withTime(match.date, range.startHour, range.startMinute);
    const end = withTime(match.date, range.endHour, range.endMinute);
    const court = match.court ? (/cancha/i.test(match.court) ? match.court : `Cancha ${match.court}`) : "Cancha por confirmar";
    const category = match.category ? (/categor/i.test(match.category) ? match.category : `Categoría ${match.category}`) : "Escalerilla Open Tennis";
    const uid = `${calendarTimestamp(start)}-${String(player).toLowerCase().replace(/[^a-z0-9]+/g, "-")}@opentennis.cl`;
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Open Tennis Huechuraba//Escalerilla 2026//ES",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART:${calendarTimestamp(start)}`,
      `DTEND:${calendarTimestamp(end)}`,
      `SUMMARY:${escapeCalendar(`Open Tennis: ${matchTitle(match, player)}`)}`,
      `LOCATION:${escapeCalendar(court)}`,
      `DESCRIPTION:${escapeCalendar(`${category}. Revisa cualquier actualización en https://opentennis.cl/partidos.html`)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
  }

  function safeFileName(value) {
    return String(value || "open-tennis")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCalendar(match, player) {
    const calendar = buildCalendar(match, player);
    if (!calendar) return false;
    downloadBlob(new Blob([calendar], { type: "text/calendar;charset=utf-8" }), `${safeFileName(`partido-${player}`)}.ics`);
    return true;
  }

  function readableDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "fecha por confirmar";
    return new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" }).format(date);
  }

  function readableTime(turn) {
    const match = String(turn || "").match(/\(([^)]+)\)/);
    return match ? match[1].replace(/\s*[-–]\s*/g, "–") : String(turn || "horario por confirmar");
  }

  function buildMatchText(match, player) {
    if (!match || !player) return "";
    return [
      `🎾 Partido Open Tennis: ${matchTitle(match, player)}`,
      `📅 ${readableDate(match.date)}`,
      `🕐 ${readableTime(match.turn)}`,
      match.court ? `📍 ${/cancha/i.test(match.court) ? match.court : `Cancha ${match.court}`}` : "",
      match.category ? `🏆 ${/categor/i.test(match.category) ? match.category : `Categoría ${match.category}`}` : "",
      "https://opentennis.cl/partidos.html"
    ].filter(Boolean).join("\n");
  }

  async function shareText(title, text) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return "shared";
      } catch (error) {
        if (error?.name === "AbortError") return "cancelled";
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    return "whatsapp";
  }

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    if (typeof context.roundRect === "function") {
      context.roundRect(x, y, width, height, radius);
    } else {
      context.moveTo(x + radius, y);
      context.lineTo(x + width - radius, y);
      context.quadraticCurveTo(x + width, y, x + width, y + radius);
      context.lineTo(x + width, y + height - radius);
      context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      context.lineTo(x + radius, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - radius);
      context.lineTo(x, y + radius);
      context.quadraticCurveTo(x, y, x + radius, y);
      context.closePath();
    }
    context.fill();
  }

  function createMatchCardCanvas(match, player) {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 1080, 1350);
    gradient.addColorStop(0, "#05251c");
    gradient.addColorStop(0.58, "#0f523d");
    gradient.addColorStop(1, "#d66c38");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1080, 1350);

    context.globalAlpha = 0.12;
    context.fillStyle = "#fff7ea";
    context.beginPath();
    context.arc(930, 170, 220, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;

    context.fillStyle = "#fff7ea";
    context.font = "900 34px system-ui, sans-serif";
    context.fillText("OPEN TENNIS HUECHURABA", 76, 105);
    context.fillStyle = "#efb185";
    context.font = "800 25px system-ui, sans-serif";
    context.fillText("ESCALERILLA 2026 · PRÓXIMO PARTIDO", 76, 152);

    context.fillStyle = "rgba(255,253,248,.96)";
    roundedRect(context, 64, 230, 952, 760, 48);
    context.fillStyle = "#176044";
    context.font = "900 30px system-ui, sans-serif";
    context.fillText("PARTIDO PROGRAMADO", 122, 320);

    context.fillStyle = "#05251c";
    context.font = "900 62px system-ui, sans-serif";
    context.fillText(player, 122, 455, 830);
    context.fillStyle = "#ad4722";
    context.font = "900 34px system-ui, sans-serif";
    context.fillText("VS", 122, 528);
    context.fillStyle = "#05251c";
    context.font = "900 62px system-ui, sans-serif";
    context.fillText(match?.opponent || "Rival por confirmar", 122, 620, 830);

    context.fillStyle = "#51645d";
    context.font = "800 31px system-ui, sans-serif";
    const details = [
      `📅 ${readableDate(match?.date)}`,
      `🕐 ${readableTime(match?.turn)}`,
      `📍 ${match?.court ? (/cancha/i.test(match.court) ? match.court : `Cancha ${match.court}`) : "Cancha por confirmar"}`,
      `🏆 ${match?.category ? (/categor/i.test(match.category) ? match.category : `Categoría ${match.category}`) : "Categoría por confirmar"}`
    ];
    details.forEach((detail, index) => context.fillText(detail, 122, 730 + index * 62, 830));

    context.fillStyle = "#fff7ea";
    context.font = "900 43px system-ui, sans-serif";
    context.fillText("Nos vemos en la cancha", 76, 1115);
    context.fillStyle = "rgba(255,247,234,.82)";
    context.font = "700 29px system-ui, sans-serif";
    context.fillText("Programación actualizada en opentennis.cl", 76, 1175);
    context.strokeStyle = "rgba(255,247,234,.28)";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(76, 1225);
    context.lineTo(1004, 1225);
    context.stroke();
    return canvas;
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo crear la imagen.")), "image/png", 0.95);
    });
  }

  async function shareMatchCard(match, player) {
    const blob = await canvasBlob(createMatchCardCanvas(match, player));
    const fileName = `${safeFileName(`open-tennis-${player}`)}.png`;
    if (typeof File === "function" && navigator.share && navigator.canShare) {
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ title: "Próximo partido Open Tennis", text: buildMatchText(match, player), files: [file] });
          return "shared";
        } catch (error) {
          if (error?.name === "AbortError") return "cancelled";
        }
      }
    }
    downloadBlob(blob, fileName);
    return "downloaded";
  }

  return {
    parseTurnRange,
    calendarTimestamp,
    buildCalendar,
    buildMatchText,
    downloadCalendar,
    shareText,
    createMatchCardCanvas,
    shareMatchCard,
    readableDate,
    readableTime
  };
});
