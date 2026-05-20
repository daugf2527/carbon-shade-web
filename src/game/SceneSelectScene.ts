/**
 * SceneSelectScene — 中央列表页 (碳影 · 明庭)
 *
 * 双模布局: width/height >= 1.0 走桌面横屏, 否则走移动竖屏 tabs。
 * 键盘 + 鼠标 + 触摸三栖。
 */

import Phaser from "phaser";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type SceneCategory,
  type SceneEntry,
  getScenesByCategory,
} from "./sceneRegistry.js";
import {
  CARBON_PALETTE,
  CARBON_PALETTE_HEX,
  MONO_FONT_STACK,
  SERIF_FONT_STACK,
} from "./sceneHelpers.js";

type Layout = "landscape" | "portrait";

interface CategoryNode {
  category: SceneCategory;
  hit: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  indicator: Phaser.GameObjects.Rectangle;
  bg: Phaser.GameObjects.Rectangle;
}

interface CardNode {
  entry: SceneEntry;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  indicator: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  enterHint: Phaser.GameObjects.Text;
  hit: Phaser.GameObjects.Rectangle;
}

export class SceneSelectScene extends Phaser.Scene {
  private layout: Layout = "landscape";
  private activeCategory: SceneCategory = "asset";
  private selectedCardIndex = 0;

  private rootContainer?: Phaser.GameObjects.Container;
  private categoryNodes: CategoryNode[] = [];
  private cardNodes: CardNode[] = [];

  constructor() {
    super("scene-select");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CARBON_PALETTE_HEX.ink);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    });

    this.buildLayout();
    this.attachKeyboard();
  }

  private handleResize(): void {
    this.buildLayout();
  }

  private buildLayout(): void {
    this.rootContainer?.destroy(true);
    this.categoryNodes = [];
    this.cardNodes = [];
    this.rootContainer = this.add.container(0, 0);

    const { width, height } = this.scale;
    this.layout = width / height >= 1.0 ? "landscape" : "portrait";

    this.drawHeader(width);

    if (this.layout === "landscape") {
      this.drawLandscape(width, height);
    } else {
      this.drawPortrait(width, height);
    }

    this.drawFooter(width, height);
    this.refreshCards();
  }

  private drawHeader(width: number): void {
    const headerHeight = this.layout === "landscape" ? 140 : 120;
    const titleSize = this.layout === "landscape" ? 48 : 34;
    const subSize = this.layout === "landscape" ? 16 : 13;
    const tagSize = this.layout === "landscape" ? 13 : 11;

    const titleY = this.layout === "landscape" ? 44 : 36;
    const subY = titleY + (this.layout === "landscape" ? 44 : 30);
    const tagY = subY + (this.layout === "landscape" ? 22 : 18);

    const title = this.add.text(width / 2, titleY, "碳影 · 明庭", {
      fontFamily: SERIF_FONT_STACK,
      fontSize: `${titleSize}px`,
      color: CARBON_PALETTE_HEX.bone,
    }).setOrigin(0.5);

    const subtitle = this.add.text(width / 2, subY, "Carbon Shade — Hall of Lights", {
      fontFamily: SERIF_FONT_STACK,
      fontSize: `${subSize}px`,
      color: CARBON_PALETTE_HEX.ember,
    }).setOrigin(0.5);

    const tag = this.add.text(width / 2, tagY, "硅光照世，碳影问心", {
      fontFamily: SERIF_FONT_STACK,
      fontSize: `${tagSize}px`,
      color: CARBON_PALETTE_HEX.mist,
    }).setOrigin(0.5);

    const version = this.add.text(width - 24, 24, "Combat Lab v0.3", {
      fontFamily: MONO_FONT_STACK,
      fontSize: "12px",
      color: CARBON_PALETTE_HEX.mist,
    }).setOrigin(1, 0);

    const dividerY = headerHeight - 6;
    const divider = this.add.graphics();
    const segments = 80;
    const segWidth = width / segments;
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const r = Math.round(0xc9 + (0x6e - 0xc9) * t);
      const g = Math.round(0x7b + (0xc5 - 0x7b) * t);
      const b = Math.round(0x3e + (0xff - 0x3e) * t);
      const color = (r << 16) | (g << 8) | b;
      divider.fillStyle(color, 0.6);
      divider.fillRect(i * segWidth, dividerY, segWidth + 1, 1);
    }

    this.rootContainer!.add([title, subtitle, tag, version, divider]);
  }

  private drawLandscape(width: number, height: number): void {
    const headerHeight = 140;
    const footerHeight = 48;
    const contentTop = headerHeight + 16;
    const contentBottom = height - footerHeight;
    const contentHeight = contentBottom - contentTop;

    const sidebarWidth = 280;
    const sidebarX = 0;

    const sidebarBg = this.add.rectangle(sidebarX, contentTop, sidebarWidth, contentHeight, CARBON_PALETTE.veil, 1)
      .setOrigin(0, 0);
    this.rootContainer!.add(sidebarBg);

    const sidebarDivider = this.add.rectangle(sidebarWidth, contentTop, 1, contentHeight, CARBON_PALETTE.shadeLine, 1)
      .setOrigin(0, 0);
    this.rootContainer!.add(sidebarDivider);

    const rowHeight = 64;
    const rowStartY = contentTop + 24;
    CATEGORY_ORDER.forEach((category, idx) => {
      const y = rowStartY + idx * rowHeight;
      const node = this.makeCategoryRow(sidebarX + 12, y, sidebarWidth - 24, rowHeight - 12, category, "row");
      this.rootContainer!.add(node.bg);
      this.rootContainer!.add(node.indicator);
      this.rootContainer!.add(node.label);
      this.rootContainer!.add(node.count);
      this.rootContainer!.add(node.hit);
      this.categoryNodes.push(node);
    });

    this.applyCategoryStyle();
  }

  private drawPortrait(width: number, height: number): void {
    const headerHeight = 120;
    const footerHeight = 48;
    const contentTop = headerHeight + 8;

    const tabHeight = 56;
    const tabWidth = width / CATEGORY_ORDER.length;

    const tabsBg = this.add.rectangle(0, contentTop, width, tabHeight, CARBON_PALETTE.veil, 1)
      .setOrigin(0, 0);
    this.rootContainer!.add(tabsBg);

    const tabsDivider = this.add.rectangle(0, contentTop + tabHeight, width, 1, CARBON_PALETTE.shadeLine, 1)
      .setOrigin(0, 0);
    this.rootContainer!.add(tabsDivider);

    CATEGORY_ORDER.forEach((category, idx) => {
      const node = this.makeCategoryRow(idx * tabWidth, contentTop, tabWidth, tabHeight, category, "tab");
      this.rootContainer!.add(node.bg);
      this.rootContainer!.add(node.indicator);
      this.rootContainer!.add(node.label);
      this.rootContainer!.add(node.count);
      this.rootContainer!.add(node.hit);
      this.categoryNodes.push(node);
    });

    this.applyCategoryStyle();
  }

  private makeCategoryRow(
    x: number,
    y: number,
    w: number,
    h: number,
    category: SceneCategory,
    style: "row" | "tab",
  ): CategoryNode {
    const bg = this.add.rectangle(x, y, w, h, CARBON_PALETTE.veil, 0).setOrigin(0, 0);
    const indicator = this.add.rectangle(
      x,
      y + (style === "tab" ? h - 3 : 0),
      style === "tab" ? w : 3,
      style === "tab" ? 3 : h,
      CARBON_PALETTE.ember,
      1,
    ).setOrigin(0, 0).setVisible(false);

    const label = this.add.text(
      style === "row" ? x + 24 : x + w / 2,
      style === "row" ? y + h / 2 : y + h / 2 - 8,
      CATEGORY_LABELS[category],
      {
        fontFamily: SERIF_FONT_STACK,
        fontSize: style === "row" ? "18px" : "15px",
        color: CARBON_PALETTE_HEX.bone,
      },
    ).setOrigin(style === "row" ? 0 : 0.5, 0.5);

    const scenes = getScenesByCategory(category);
    const count = this.add.text(
      style === "row" ? x + w - 24 : x + w / 2,
      style === "row" ? y + h / 2 : y + h / 2 + 10,
      `(${scenes.length})`,
      {
        fontFamily: MONO_FONT_STACK,
        fontSize: style === "row" ? "13px" : "11px",
        color: CARBON_PALETTE_HEX.mist,
      },
    ).setOrigin(style === "row" ? 1 : 0.5, 0.5);

    const hit = this.add.rectangle(x, y, w, h, 0x000000, 0).setOrigin(0, 0);
    hit.setInteractive({ useHandCursor: true });

    hit.on("pointerover", () => {
      if (this.activeCategory !== category) {
        bg.setFillStyle(CARBON_PALETTE.shadeLine, 0.5);
      }
    });
    hit.on("pointerout", () => {
      if (this.activeCategory !== category) {
        bg.setFillStyle(CARBON_PALETTE.veil, 0);
      }
    });
    hit.on("pointerup", () => {
      this.setActiveCategory(category);
    });

    return { category, hit, label, count, indicator, bg };
  }

  private applyCategoryStyle(): void {
    for (const node of this.categoryNodes) {
      const active = node.category === this.activeCategory;
      node.indicator.setVisible(active);
      node.bg.setFillStyle(active ? CARBON_PALETTE.shadeLine : CARBON_PALETTE.veil, active ? 0.6 : 0);
      node.label.setColor(active ? CARBON_PALETTE_HEX.bone : CARBON_PALETTE_HEX.mist);
    }
  }

  private setActiveCategory(category: SceneCategory): void {
    if (this.activeCategory === category) return;
    this.activeCategory = category;
    this.selectedCardIndex = 0;
    this.applyCategoryStyle();
    this.refreshCards();
  }

  private refreshCards(): void {
    for (const card of this.cardNodes) {
      card.container.destroy(true);
    }
    this.cardNodes = [];

    const scenes = getScenesByCategory(this.activeCategory);
    const { width, height } = this.scale;
    const headerHeight = this.layout === "landscape" ? 140 : 120;
    const footerHeight = 48;

    let cardAreaX: number;
    let cardAreaY: number;
    let cardAreaW: number;
    if (this.layout === "landscape") {
      cardAreaX = 280 + 32;
      cardAreaY = headerHeight + 32;
      cardAreaW = width - cardAreaX - 32;
    } else {
      cardAreaX = 16;
      cardAreaY = headerHeight + 8 + 56 + 24;
      cardAreaW = width - 32;
    }

    if (scenes.length === 0) {
      const empty = this.add.text(cardAreaX + cardAreaW / 2, cardAreaY + 60, "（此分类暂无场景）", {
        fontFamily: SERIF_FONT_STACK,
        fontSize: "16px",
        color: CARBON_PALETTE_HEX.mist,
      }).setOrigin(0.5);
      this.rootContainer!.add(empty);
      return;
    }

    const cardH = 112;
    const cardGap = 16;
    scenes.forEach((entry, idx) => {
      const y = cardAreaY + idx * (cardH + cardGap);
      const card = this.makeCard(cardAreaX, y, cardAreaW, cardH, entry, idx);
      this.rootContainer!.add(card.container);
      this.cardNodes.push(card);
    });

    this.applyCardSelection();
  }

  private makeCard(x: number, y: number, w: number, h: number, entry: SceneEntry, index: number): CardNode {
    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, w, h, CARBON_PALETTE.veil, 0.8).setOrigin(0, 0);
    bg.setStrokeStyle(1, CARBON_PALETTE.shadeLine, 1);

    const indicator = this.add.rectangle(0, 0, 4, h, CARBON_PALETTE.ember, 1).setOrigin(0, 0).setVisible(false);

    const title = this.add.text(24, 22, entry.title, {
      fontFamily: SERIF_FONT_STACK,
      fontSize: "22px",
      color: CARBON_PALETTE_HEX.bone,
    });

    const desc = this.add.text(24, 58, entry.description, {
      fontFamily: MONO_FONT_STACK,
      fontSize: "13px",
      color: CARBON_PALETTE_HEX.mist,
      wordWrap: { width: w - 140 },
    });

    const enterHint = this.add.text(w - 24, h / 2, "进入 →", {
      fontFamily: SERIF_FONT_STACK,
      fontSize: "15px",
      color: CARBON_PALETTE_HEX.ember,
    }).setOrigin(1, 0.5);

    const hit = this.add.rectangle(0, 0, w, h, 0x000000, 0).setOrigin(0, 0);
    hit.setInteractive({ useHandCursor: true });

    hit.on("pointerover", () => {
      if (this.selectedCardIndex !== index) {
        bg.setFillStyle(CARBON_PALETTE.veil, 0.95);
        bg.setStrokeStyle(1, CARBON_PALETTE.mist, 1);
      }
    });
    hit.on("pointerout", () => {
      if (this.selectedCardIndex !== index) {
        bg.setFillStyle(CARBON_PALETTE.veil, 0.8);
        bg.setStrokeStyle(1, CARBON_PALETTE.shadeLine, 1);
      }
    });
    hit.on("pointerup", () => {
      this.selectedCardIndex = index;
      this.applyCardSelection();
      this.enterSelectedScene();
    });

    container.add([bg, indicator, title, desc, enterHint, hit]);

    return { entry, container, bg, indicator, title, desc, enterHint, hit };
  }

  private applyCardSelection(): void {
    for (let i = 0; i < this.cardNodes.length; i++) {
      const card = this.cardNodes[i];
      const selected = i === this.selectedCardIndex;
      card.indicator.setVisible(selected);
      card.bg.setFillStyle(CARBON_PALETTE.veil, selected ? 1 : 0.8);
      card.bg.setStrokeStyle(1, selected ? CARBON_PALETTE.ember : CARBON_PALETTE.shadeLine, 1);
      card.title.setColor(selected ? CARBON_PALETTE_HEX.bone : CARBON_PALETTE_HEX.bone);
    }
  }

  private enterSelectedScene(): void {
    const scenes = getScenesByCategory(this.activeCategory);
    const entry = scenes[this.selectedCardIndex];
    if (!entry) return;
    this.scene.start(entry.key);
  }

  private attachKeyboard(): void {
    this.input.keyboard?.on("keydown-UP", () => {
      if (this.cardNodes.length === 0) return;
      this.selectedCardIndex = (this.selectedCardIndex - 1 + this.cardNodes.length) % this.cardNodes.length;
      this.applyCardSelection();
    });
    this.input.keyboard?.on("keydown-DOWN", () => {
      if (this.cardNodes.length === 0) return;
      this.selectedCardIndex = (this.selectedCardIndex + 1) % this.cardNodes.length;
      this.applyCardSelection();
    });
    this.input.keyboard?.on("keydown-TAB", (event: { preventDefault: () => void }) => {
      event.preventDefault();
      const idx = CATEGORY_ORDER.indexOf(this.activeCategory);
      const next = CATEGORY_ORDER[(idx + 1) % CATEGORY_ORDER.length];
      this.setActiveCategory(next);
    });
    this.input.keyboard?.on("keydown-ENTER", () => this.enterSelectedScene());
    this.input.keyboard?.on("keydown-SPACE", () => this.enterSelectedScene());
  }

  private drawFooter(width: number, height: number): void {
    const footerHeight = 48;
    const y = height - footerHeight;

    const bg = this.add.rectangle(0, y, width, footerHeight, CARBON_PALETTE.veil, 1).setOrigin(0, 0);
    const divider = this.add.rectangle(0, y, width, 1, CARBON_PALETTE.shadeLine, 1).setOrigin(0, 0);

    const hint = this.layout === "landscape"
      ? "↑/↓ 选择 · Enter 进入 · Tab 切换分类"
      : "点击 tab 切换分类 · 点击卡片进入";

    const text = this.add.text(width / 2, y + footerHeight / 2, hint, {
      fontFamily: MONO_FONT_STACK,
      fontSize: "12px",
      color: CARBON_PALETTE_HEX.mist,
    }).setOrigin(0.5);

    this.rootContainer!.add([bg, divider, text]);
  }
}
