// UI text in English and Chinese. The language follows the system unless the user picks one in Settings.
import { reactive } from 'vue';

const en = {
  appName: 'Ppeely',
  ok: 'OK',
  cancel: 'Cancel',
  save: 'Save',
  delete: 'Delete',
  create: 'Create',
  loading: 'Please wait…',
  error: 'Something went wrong.',
  startupFailed: 'Ppeely could not start. Your sticker packs are still stored on this device.',
  retry: 'Try again',
  back: 'Back',

  homeEmptyTitle: 'No sticker packs yet',
  homeEmptyText: 'Create a pack to start making stickers.',
  createPack: 'New sticker pack',
  importPack: 'Import sticker pack',
  packName: 'Sticker pack name',
  packAuthor: 'Sticker pack author',
  packTextInvalid: 'Enter a name and an author, each 3 to 30 characters long.',
  stickerCount: (count: number) => `${count} / 30`,
  animatedBadge: 'Animated',
  searchPacks: 'Search',
  settings: 'Settings',

  trayIcon: 'Tray icon',
  addTrayIconHint: 'Add a tray icon to get started. If you skip it, the first sticker is used.',
  renamePack: 'Rename sticker pack',
  deletePackTitle: 'Delete sticker pack?',
  deletePackMessage: 'The pack and all of its stickers will be deleted.',
  sharePack: 'Share sticker pack',
  addToWhatsApp: 'Add to WhatsApp',
  addChangesToWhatsApp: 'Add changes to WhatsApp',
  packUpdated: 'Pack updated. Restart WhatsApp to see the changes.',
  packAdded: 'Sticker pack added to WhatsApp.',
  needOneSticker: 'You need at least one sticker in your pack.',
  whatsAppMissing: 'WhatsApp is not installed on this device.',
  whatsAppRejected: 'WhatsApp did not accept this sticker pack.',
  packFull: 'A pack can hold up to 30 stickers.',

  pickImageFrom: 'Choose a source',
  takePhoto: 'Take photo',
  openGallery: 'Photo library',
  selectFile: 'Browse files',
  selectFileHint: 'Image, GIF, video or animated WebP',
  stickerLibrary: 'Sticker library',
  textOnly: 'Text only',
  loadingImage: 'Loading image',
  unableToLoadImage: 'This file could not be opened. Supported types: PNG, JPEG, WebP, GIF and video.',
  creatingAnimated: 'Creating animated sticker…',
  encodingAnimated: 'Encoding animation…',
  optimizingQuality: 'Improving quality…',
  optimizingQualityMore: 'Improving quality further…',
  animatedFailed: 'This file could not be turned into a sticker. Try another video or GIF.',
  savingSticker: 'Saving sticker…',

  changeEmoji: 'Edit emoji',
  changeEmojiHint: 'Choose up to 3 emoji that describe this sticker. WhatsApp uses them to sort stickers into its search categories.',
  emojiGroups: { love: 'Love', happy: 'Happy', sad: 'Sad', angry: 'Angry', greet: 'Greetings', celebrate: 'Celebrate' },
  deleteStickerTitle: 'Delete sticker?',
  deleteStickerMessage: 'This sticker will be removed from the pack.',

  cutInstructions: 'Trace around the part you want to keep.\nPinch with two fingers to zoom or move the image.',
  polygonInstructions: 'Tap to add points. Tap the first point to close the shape.',
  rotate: 'Rotate',
  selectAll: 'Select all',
  smartSelect: 'Auto select',
  freehand: 'Freehand',
  square: 'Square',
  circle: 'Circle',
  polygon: 'Polygon',
  undo: 'Undo',
  rotating: 'Rotating…',
  smartSelecting: 'Finding the subject…',
  smartSelectFailed: 'No subject found. Try drawing the outline yourself.',
  selectionEmpty: 'The selected area is empty.',

  addText: 'Add text',
  outline: 'Outline',
  outlineColor: 'Outline color',
  outlineWidth: 'Outline width',
  tryAgain: 'Recut',
  saveSticker: 'Save sticker',
  textPlaceholder: 'Type here',
  dropToDelete: 'Drop here to delete',
  nothingToSave: 'There is nothing to save yet. Add some text first.',

  libraryTitle: 'Select sticker',
  libraryMine: 'My stickers',
  libraryReceived: 'Sent & Received',
  libraryEmpty: 'No stickers here yet.',
  libraryPrivacy: 'These are stickers you sent or received in WhatsApp. They are read from this device only.',
  libraryNeedAccess:
    'To show sent and received stickers, allow access to the WhatsApp media folder (Android/media/com.whatsapp).',
  allowAccess: 'Allow access',
  libraryUnavailable: 'Sent and received stickers are only available on Android.',

  settingsGeneral: 'General',
  settingsLanguage: 'Language',
  languageSystem: 'System default',
  settingsAnimation: 'Animated stickers',
  settingsAnimationQuality: 'Higher quality (slower)',
  settingsAnimationQualityHint: 'Encodes several times to find the best quality that fits the size limit.',
  settingsFrameLimit: 'Allow up to 100 frames',
  settingsFrameLimitHint: 'Stickers above 60 frames may be rejected by WhatsApp.',
  settingsFiles: 'Sticker pack files',
  settingsImporter: 'Open .wastickers files',
  settingsImporterHint: 'Show this app as an option when a .wastickers file is opened.',
  settingsCustomFonts: 'Custom fonts',
  settingsCustomFontsHint: 'Use your own font files for text stickers',
  settingsKeyboard: 'Sticker keyboard',
  settingsKeyboardHint: 'Send your stickers from a keyboard in WhatsApp and other apps.',
  settingsKeyboardEnable: 'Enable in system settings',
  settingsKeyboardSwitch: 'Switch keyboard',
  settingsKeyboardEnabled: 'Enabled',
  settingsKeyboardDisabled: 'Not enabled',
  settingsBackup: 'Backup',
  settingsBackupCreate: 'Create backup',
  settingsBackupCreateHint: 'Save all your sticker packs into one file.',
  settingsBackupRestore: 'Restore backup',
  settingsBackupRestoreHint: 'Add the sticker packs from a backup file.',
  creatingBackup: 'Creating backup',
  restoringBackup: 'Restoring backup',
  backupRestored: (count: number) => `Restored ${count} sticker pack(s).`,
  backupInvalid: 'This is not a backup file.',
  backupEmpty: 'There are no sticker packs to back up.',
  settingsDanger: 'Data',
  settingsDeleteAll: 'Delete all sticker packs',
  settingsDeleteAllHint: 'Remove every sticker pack stored on this device.',
  deleteAllTitle: 'Delete all sticker packs?',
  deleteAllMessage: 'Every sticker pack on this device and its files will be removed. This cannot be undone.',
  allDeleted: 'All sticker packs were deleted.',
  about: 'About',
  aboutText: 'Stickers are created and stored on this device. Nothing is uploaded.',
  aboutDisclaimer: 'Ppeely is an independent project and is not affiliated with, endorsed by, or sponsored by WhatsApp or Meta.',
  licensesTitle: 'Open source licenses',
  licensesUnavailable: 'The license list could not be loaded.',

  fontsTitle: 'Custom fonts',
  fontsAdd: 'Add font',
  fontsEmptyTitle: 'No custom fonts yet',
  fontsEmptyText: 'Tap the button below to add a .ttf or .otf file.',
  fontInvalid: 'This file is not a usable font.',
  fontDeleteTitle: 'Delete font?',

  importInvalid: 'This is not a valid sticker pack file',
  importing: 'Importing sticker pack…',
  imported: 'Sticker pack imported. You can add it to WhatsApp now.',
  defaultPackName: 'My stickers',
  defaultAuthor: 'Me',
};

type Dictionary = typeof en;

const zh: Dictionary = {
  appName: 'Ppeely',
  ok: '确定',
  cancel: '取消',
  save: '保存',
  delete: '删除',
  create: '创建',
  loading: '请稍候…',
  error: '出错了',
  startupFailed: 'Ppeely 启动失败。你的贴图包仍然保存在这台设备上。',
  retry: '重试',
  back: '返回',

  homeEmptyTitle: '还没有贴图',
  homeEmptyText: '先创建第一个贴图包吧。',
  createPack: '新建贴图包',
  importPack: '导入贴图包',
  packName: '贴图包名称',
  packAuthor: '贴图包作者',
  packTextInvalid: '贴图包名称和作者都必须填写，长度在 3 到 30 个字符之间。',
  stickerCount: (count: number) => `${count} / 30`,
  animatedBadge: '动态',
  searchPacks: '搜索',
  settings: '设置',

  trayIcon: '托盘图标',
  addTrayIconHint: '先添加一个托盘图标；不添加时会使用第一张贴图。',
  renamePack: '重命名贴图包',
  deletePackTitle: '删除贴图包？',
  deletePackMessage: '确定要删除这个贴图包吗？',
  sharePack: '分享贴图包',
  addToWhatsApp: '添加到 WhatsApp',
  addChangesToWhatsApp: '把改动添加到 WhatsApp',
  packUpdated: '贴图包已更新，请关闭并重新打开 WhatsApp。',
  packAdded: '贴图包已添加到 WhatsApp。',
  needOneSticker: '贴图包里至少要有一张贴图。',
  whatsAppMissing: '这台设备没有安装 WhatsApp。',
  whatsAppRejected: 'WhatsApp 没有接受这个贴图包。',
  packFull: '一个贴图包最多 30 张贴图。',

  pickImageFrom: '选择图片来源',
  takePhoto: '拍照',
  openGallery: '打开相册',
  selectFile: '选择文件',
  selectFileHint: '图片、GIF、视频或动画 WebP',
  stickerLibrary: '贴图库',
  textOnly: '纯文字',
  loadingImage: '正在加载图片',
  unableToLoadImage: '无法加载这个文件。支持的类型：PNG、JPEG、WebP、GIF 和视频。',
  creatingAnimated: '正在生成动态贴图…',
  encodingAnimated: '正在编码动画…',
  optimizingQuality: '正在优化贴图质量。',
  optimizingQualityMore: '正在进一步优化贴图质量。',
  animatedFailed: '无法用这个文件生成贴图，请换一个视频或 GIF。',
  savingSticker: '正在保存贴图…',

  changeEmoji: '更改表情符号',
  changeEmojiHint: '最多选择 3 个与贴图相符的表情符号。WhatsApp 按它们把贴图归入搜索分类。',
  emojiGroups: { love: '爱', happy: '开心', sad: '难过', angry: '生气', greet: '问候', celebrate: '庆祝' },
  deleteStickerTitle: '确定吗？',
  deleteStickerMessage: '确定要从贴图包里删除这张贴图吗？',

  cutInstructions: '用手指画出轮廓来选择贴图区域。\n用两根手指缩放和移动画面。',
  polygonInstructions: '点击添加顶点，点击第一个顶点闭合图形。',
  rotate: '旋转',
  selectAll: '全选',
  smartSelect: '智能选择',
  freehand: '手绘',
  square: '矩形',
  circle: '圆形',
  polygon: '多边形',
  undo: '撤销',
  rotating: '正在旋转…',
  smartSelecting: '正在识别主体…',
  smartSelectFailed: '没有识别到主体，请手动画出轮廓。',
  selectionEmpty: '选中的区域是空的。',

  addText: '添加文字',
  outline: '描边',
  outlineColor: '描边颜色',
  outlineWidth: '描边宽度',
  tryAgain: '重新裁剪',
  saveSticker: '保存贴图',
  textPlaceholder: '在这里输入',
  dropToDelete: '拖到这里删除',
  nothingToSave: '还没有可保存的内容，请先添加文字。',

  libraryTitle: '选择贴图',
  libraryMine: '我的贴图',
  libraryReceived: '收发的贴图',
  libraryEmpty: '这里还没有贴图。',
  libraryPrivacy: '这里列出你在 WhatsApp 里发送或收到的贴图，只在本机读取。',
  libraryNeedAccess: '要显示收发的贴图，请允许访问 WhatsApp 的媒体文件夹（Android/media/com.whatsapp）。',
  allowAccess: '允许访问',
  libraryUnavailable: '收发的贴图只在 Android 上可用。',

  settingsGeneral: '通用',
  settingsLanguage: '语言',
  languageSystem: '跟随系统',
  settingsAnimation: '动态贴图',
  settingsAnimationQuality: '优先保证质量',
  settingsAnimationQualityHint: '生成质量更高的动态贴图可能需要更长时间。',
  settingsFrameLimit: '允许最多 100 帧',
  settingsFrameLimitHint: '超过 60 帧的贴图在 WhatsApp 上可能无法使用。',
  settingsFiles: '贴图包文件',
  settingsImporter: '打开贴图包文件',
  settingsImporterHint: '打开 .wastickers 文件时把本应用列为可选应用。',
  settingsCustomFonts: '自定义字体',
  settingsCustomFontsHint: '添加和管理用于文字贴图的字体',
  settingsKeyboard: '贴图键盘',
  settingsKeyboardHint: '在 WhatsApp 等应用里通过键盘发送你的贴图。',
  settingsKeyboardEnable: '在系统设置中启用',
  settingsKeyboardSwitch: '切换键盘',
  settingsKeyboardEnabled: '已启用',
  settingsKeyboardDisabled: '未启用',
  settingsBackup: '备份',
  settingsBackupCreate: '创建备份',
  settingsBackupCreateHint: '把全部贴图包保存成一个文件。',
  settingsBackupRestore: '恢复备份',
  settingsBackupRestoreHint: '把备份文件里的贴图包加回来。',
  creatingBackup: '正在创建备份',
  restoringBackup: '正在恢复备份',
  backupRestored: (count: number) => `已恢复 ${count} 个贴图包。`,
  backupInvalid: '这不是备份文件。',
  backupEmpty: '没有可备份的贴图包。',
  settingsDanger: '数据',
  settingsDeleteAll: '删除全部贴图包',
  settingsDeleteAllHint: '删除这台设备上创建的全部贴图包。',
  deleteAllTitle: '删除全部贴图包？',
  deleteAllMessage: '这会永久删除这台设备上的全部贴图包及其文件，无法撤销。',
  allDeleted: '已删除全部贴图包。',
  about: '关于',
  aboutText: '贴图在本机制作并保存，不会上传任何内容。',
  aboutDisclaimer: 'Ppeely 是独立项目，与 WhatsApp 和 Meta 没有关联，也未获得其认可或赞助。',
  licensesTitle: '开源许可',
  licensesUnavailable: '无法加载许可证清单。',

  fontsTitle: '我的自定义字体',
  fontsAdd: '添加自定义字体',
  fontsEmptyTitle: '还没有自定义字体',
  fontsEmptyText: '点击下方按钮添加 .ttf 或 .otf 文件。',
  fontInvalid: '这个文件不是可用的字体。',
  fontDeleteTitle: '删除字体？',

  importInvalid: '无效的贴图包文件',
  importing: '正在导入贴图包…',
  imported: '贴图包已加入你的收藏，现在可以添加到 WhatsApp 了。',
  defaultPackName: '我的贴图',
  defaultAuthor: '我',
};

export type LanguagePreference = 'system' | Language;

type Language = 'en' | 'zh';

const dictionaries: Record<Language, Dictionary> = { en, zh };

// Each language is listed under its own name, so it can be found whatever language the UI is currently in.
export const languageNames: Record<Language, string> = { en: 'English', zh: '中文' };

// Reactive so templates re-render when the language changes. Read entries when they are used; a copy kept in a constant
// would stay in the old language.
export const t: Dictionary = reactive({ ...en });

let preference: LanguagePreference = 'system';

export function setLanguagePreference(next: LanguagePreference): void {
  preference = next;
  applyLanguage();
}

// "system" picks Chinese for any Chinese system locale and English for everything else.
function resolveLanguage(): Language {
  if (preference === 'en' || preference === 'zh') {
    return preference;
  }

  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function applyLanguage(): void {
  const language = resolveLanguage();
  Object.assign(t, dictionaries[language]);
  // The page language follows the UI text, for screen readers and so the browser picks the right CJK glyphs.
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
}

applyLanguage();

// Follow a change of the system language while the app is running.
window.addEventListener('languagechange', () => {
  if (preference === 'system') {
    applyLanguage();
  }
});
