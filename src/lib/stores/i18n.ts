import { derived } from 'svelte/store';
import { settings } from '$lib/stores/settings';
import type { Anime, Lang } from '$lib/types';

/** Active site language, kept in sync with the settings store. */
export const lang = derived(settings, ($s) => $s.lang);

export const LANGS: { id: Lang; label: string; native: string }[] = [
	{ id: 'en', label: 'EN', native: 'English' },
	{ id: 'jp', label: 'JP', native: '日本語' },
	{ id: 'romaji', label: 'RO', native: 'Romaji' }
];

type Entry = { en: string; jp: string; romaji: string };
type Dict = Record<string, Entry>;

/**
 * UI strings translated across the three site languages.
 * `jp` is written in Japanese so selecting JP switches every label on the site.
 */
const STRINGS: Dict = {
	/* nav / shell */
	home: { en: 'Home', jp: 'ホーム', romaji: 'Home' },
	catalog: { en: 'Catalog', jp: 'カタログ', romaji: 'Catalog' },
	schedule: { en: 'Schedule', jp: 'スケジュール', romaji: 'Schedule' },
	watchlist: { en: 'Watchlist', jp: 'ウォッチリスト', romaji: 'Watchlist' },
	search: { en: 'Search', jp: '検索', romaji: 'Search' },
	searchShort: { en: 'Search…', jp: '検索…', romaji: 'Search…' },
	searchAnime: { en: 'Search anime…', jp: 'アニメを検索…', romaji: 'Search anime…' },
	searchTitles: { en: 'Search titles…', jp: 'タイトルを検索…', romaji: 'Search titles…' },
	openSearch: { en: 'Open search page', jp: '検索ページを開く', romaji: 'Open search page' },
	quickLinks: { en: 'Quick links', jp: 'クイックリンク', romaji: 'Quick links' },
	continueWatching: { en: 'Continue Watching', jp: '続きから見る', romaji: 'Continue Watching' },
	settings: { en: 'Settings', jp: '設定', romaji: 'Settings' },
	profile: { en: 'Profile', jp: 'プロフィール', romaji: 'Profile' },
	profileMore: { en: 'Profile & more', jp: 'プロフィールとその他', romaji: 'Profile & more' },
	searchCatalog: { en: 'Search / Catalog', jp: '検索・カタログ', romaji: 'Search / Catalog' },
	guest: { en: 'Guest', jp: 'ゲスト', romaji: 'Guest' },

	/* error page */
	errorNotFound: {
		en: 'This page slipped into the shadows.',
		jp: 'このページは影に消えてしまいました。',
		romaji: 'This page slipped into the shadows.'
	},
	errorForbidden: {
		en: 'You do not have access to this page.',
		jp: 'このページにアクセスする権限がありません。',
		romaji: 'You do not have access to this page.'
	},
	errorGeneric: {
		en: 'Something went wrong on our side.',
		jp: 'サーバー側で問題が発生しました。',
		romaji: 'Something went wrong on our side.'
	},
	errorBackHome: { en: 'Back to home', jp: 'ホームへ戻る', romaji: 'Back to home' },
	errorGoBack: { en: 'Go back', jp: '前のページへ', romaji: 'Go back' },
	errorCode: { en: 'Error code', jp: 'エラーコード', romaji: 'Error code' },
	anilistConnected: { en: 'AniList connected', jp: 'AniList 連携中', romaji: 'AniList connected' },
	malConnected: { en: 'MyAnimeList connected', jp: 'MyAnimeList 連携中', romaji: 'MyAnimeList connected' },
	bothConnected: { en: 'AniList + MyAnimeList', jp: 'AniList + MyAnimeList', romaji: 'AniList + MyAnimeList' },
	signInAniList: { en: 'Sign in with AniList', jp: 'AniListでログイン', romaji: 'Sign in with AniList' },
	signInMal: { en: 'Sign in with MyAnimeList', jp: 'MyAnimeListでログイン', romaji: 'Sign in with MyAnimeList' },
	signOutAniList: { en: 'Sign out of AniList', jp: 'AniListからログアウト', romaji: 'Sign out of AniList' },
	signOutMal: { en: 'Sign out of MyAnimeList', jp: 'MyAnimeListからログアウト', romaji: 'Sign out of MyAnimeList' },
	notSignedIn: { en: 'Not signed in', jp: '未ログイン', romaji: 'Not signed in' },
	signIn: { en: 'Sign in with AniList', jp: 'AniList でログイン', romaji: 'Sign in with AniList' },
	signOut: { en: 'Sign out', jp: 'ログアウト', romaji: 'Sign out' },
	importFrom: { en: 'Import from AniList', jp: 'AniList から取り込む', romaji: 'Import from AniList' },
	pushTo: { en: 'Push to AniList', jp: 'AniList へ送信', romaji: 'Push to AniList' },
	syncAnilist: { en: 'Sync with AniList', jp: 'AniListと同期', romaji: 'Sync with AniList' },
	syncMal: {
		en: 'Sync with MyAnimeList',
		jp: 'MyAnimeListと同期',
		romaji: 'Sync with MyAnimeList'
	},
	syncing: { en: 'Syncing…', jp: '同期中…', romaji: 'Syncing…' },
	siteLanguage: { en: 'Site language', jp: '表示言語', romaji: 'Site language' },
	changeLanguage: { en: 'Change language', jp: '言語を変更', romaji: 'Change language' },
	theme: { en: 'Theme', jp: 'テーマ', romaji: 'Theme' },
	chooseTheme: { en: 'Choose theme', jp: 'テーマを選択', romaji: 'Choose theme' },
	closeMenus: { en: 'Close menus', jp: 'メニューを閉じる', romaji: 'Close menus' },

	/* rankings / rails */
	topToday: { en: 'Today', jp: '今日', romaji: 'Today' },
	topWeek: { en: 'This Week', jp: '今週', romaji: 'This Week' },
	topMonth: { en: 'This Month', jp: '今月', romaji: 'This Month' },
	rankings: { en: 'Rankings', jp: 'ランキング', romaji: 'Rankings' },
	viewAll: { en: 'View all', jp: 'すべて表示', romaji: 'View all' },
	retry: { en: 'Retry', jp: '再試行', romaji: 'Retry' },

	/* anime actions */
	watchNow: { en: 'Watch Now', jp: '今すぐ視聴', romaji: 'Watch Now' },
	watchlistAdd: { en: 'Add to Watchlist', jp: 'ウォッチリストに追加', romaji: 'Add to Watchlist' },
	inWatchlist: { en: 'In Watchlist', jp: 'ウォッチリスト済み', romaji: 'In Watchlist' },
	addToWatchlist: { en: 'Add to watchlist', jp: 'ウォッチリストに追加', romaji: 'Add to watchlist' },
	removeFromList: { en: 'Remove from list', jp: 'リストから削除', romaji: 'Remove from list' },
	remove: { en: 'Remove', jp: '削除', romaji: 'Remove' },
	details: { en: 'Details', jp: '詳細', romaji: 'Details' },
	showInfo: { en: 'Show info', jp: '作品情報', romaji: 'Show info' },
	episodes: { en: 'Episodes', jp: 'エピソード', romaji: 'Episodes' },
	episode: { en: 'Episode', jp: 'エピソード', romaji: 'Episode' },
	synopsisUnavailable: { en: 'Synopsis unavailable.', jp: 'あらすじはありません。', romaji: 'Synopsis unavailable.' },
	noResultsFor: { en: 'No results for', jp: '該当する結果はありません', romaji: 'No results for' },
	viewAllResults: { en: 'View all results', jp: 'すべての結果を表示', romaji: 'View all results' },
	navigate: { en: 'navigate', jp: '移動', romaji: 'navigate' },
	open: { en: 'open', jp: '開く', romaji: 'open' },

	/* schedule */
	scheduleToday: { en: 'Today', jp: '今日', romaji: 'Today' },
	airingToday: { en: 'Airing Today', jp: '本日の放送', romaji: 'Airing Today' },
	fullSchedule: { en: 'Full schedule', jp: '週間スケジュール', romaji: 'Full schedule' },
	releaseSchedule: { en: 'Release Schedule', jp: '放送スケジュール', romaji: 'Release Schedule' },
	inMyWatchlistOnly: { en: 'In my watchlist only', jp: 'ウォッチリストのみ', romaji: 'In my watchlist only' },
	timesInTimezone: { en: 'times in your timezone', jp: '時刻はあなたのタイムゾーン', romaji: 'times in your timezone' },
	nextUp: { en: 'Next up', jp: '次の放送', romaji: 'Next up' },
	aired: { en: 'Aired', jp: '放送済み', romaji: 'Aired' },
	nothingAirsToday: { en: 'Nothing airs today.', jp: '本日の放送はありません。', romaji: 'Nothing airs today.' },
	nothingWatchlistDay: {
		en: 'Nothing in your watchlist airs this day.',
		jp: 'この日のウォッチリスト放送はありません。',
		romaji: 'Nothing in your watchlist airs this day.'
	},
	noAiringDay: { en: 'No airing entries for this day.', jp: 'この日の放送はありません。', romaji: 'No airing entries for this day.' },
	browseWeekly: { en: 'Browse the weekly calendar', jp: '週間カレンダーを見る', romaji: 'Browse the weekly calendar' },

	/* watch page */
	player: { en: 'Video player', jp: '動画プレイヤー', romaji: 'Video player' },
	connecting: { en: 'Connecting to server…', jp: 'サーバーに接続中…', romaji: 'Connecting to server…' },
	noStream: { en: 'No stream available.', jp: '再生できる配信がありません。', romaji: 'No stream available.' },
	noServers: { en: 'No servers available.', jp: '利用可能なサーバーがありません。', romaji: 'No servers available.' },
	server: { en: 'Server', jp: 'サーバー', romaji: 'Server' },
	selectServer: { en: 'Select server', jp: 'サーバーを選択', romaji: 'Select server' },
	downloads: { en: 'Downloads', jp: 'ダウンロード', romaji: 'Downloads' },
	exitTheater: { en: 'Exit theater', jp: 'シアターを終了', romaji: 'Exit theater' },
	preferServers: { en: 'Prefer', jp: '優先', romaji: 'Prefer' },
	serversSuffix: { en: 'servers', jp: 'サーバー', romaji: 'servers' },
	discussion: { en: 'Discussion', jp: 'ディスカッション', romaji: 'Discussion' },
	communityDiscussion: { en: 'Community Discussion', jp: 'コミュニティ討論', romaji: 'Community Discussion' },
	closeDiscussion: { en: 'Close discussion', jp: '討論を閉じる', romaji: 'Close discussion' },
	noPlayableServers: {
		en: 'No playable servers for this episode right now.',
		jp: 'このエピソードは現在再生できるサーバーがありません。',
		romaji: 'No playable servers for this episode right now.'
	},
	streamUnavailable: { en: 'Stream service unavailable.', jp: '配信サービスを利用できません。', romaji: 'Stream service unavailable.' },
	failedLoadTitle: { en: 'Failed to load this title.', jp: '作品の読み込みに失敗しました。', romaji: 'Failed to load this title.' },

	/* episode list */
	episodeDisplay: { en: 'Episode display', jp: 'エピソード表示', romaji: 'Episode display' },
	tiles: { en: 'Tiles', jp: 'タイル', romaji: 'Tiles' },
	titles: { en: 'Titles', jp: 'タイトル', romaji: 'Titles' },
	thumbnails: { en: 'Thumbnails', jp: 'サムネイル', romaji: 'Thumbnails' },
	episodeRange: { en: 'Episode range', jp: 'エピソード範囲', romaji: 'Episode range' },
	filterEpisodes: { en: 'Filter episodes…', jp: 'エピソードを絞り込む…', romaji: 'Filter episodes…' },
	noEpisodeData: { en: 'No episode data available yet.', jp: 'エピソード情報はまだありません。', romaji: 'No episode data available yet.' },
	noEpisodesMatch: { en: 'No episodes match', jp: '一致するエピソードはありません', romaji: 'No episodes match' },

	/* watchlist page */
	titlesSaved: { en: 'titles saved', jp: '件保存', romaji: 'titles saved' },
	searchWatchlist: { en: 'Search watchlist…', jp: 'ウォッチリストを検索…', romaji: 'Search watchlist…' },
	toggleLayout: { en: 'Toggle layout', jp: 'レイアウト切替', romaji: 'Toggle layout' },
	all: { en: 'All', jp: 'すべて', romaji: 'All' },
	watchlistEmpty: { en: 'Your watchlist is empty.', jp: 'ウォッチリストは空です。', romaji: 'Your watchlist is empty.' },
	findSomething: { en: 'Find something', jp: '作品を探す', romaji: 'Find something' },
	noTitlesMatch: { en: 'No titles match', jp: '一致する作品はありません', romaji: 'No titles match' },
	nothingIn: { en: 'Nothing in', jp: '空です:', romaji: 'Nothing in' },
	play: { en: 'Play', jp: '再生', romaji: 'Play' },

	/* search page */
	searchTitlesLabel: { en: 'Search titles', jp: 'タイトルを検索', romaji: 'Search titles' },
	clearSearch: { en: 'Clear search', jp: '検索をクリア', romaji: 'Clear search' },
	gridView: { en: 'Grid view', jp: 'グリッド表示', romaji: 'Grid view' },
	rowView: { en: 'Row view', jp: 'リスト表示', romaji: 'Row view' },
	resultsFor: { en: 'Results for', jp: '検索結果', romaji: 'Results for' },
	loading: { en: 'Loading…', jp: '読み込み中…', romaji: 'Loading…' },
	titleCount: { en: 'title', jp: '件', romaji: 'title' },
	titlesCount: { en: 'titles', jp: '件', romaji: 'titles' },
	clearAll: { en: 'Clear all', jp: 'すべて解除', romaji: 'Clear all' },
	resetFilters: { en: 'Reset filters', jp: 'フィルターをリセット', romaji: 'Reset filters' },
	noTitlesMatched: { en: 'No titles matched your filters.', jp: '条件に一致する作品はありません。', romaji: 'No titles matched your filters.' },
	prev: { en: 'Prev', jp: '前へ', romaji: 'Prev' },
	next: { en: 'Next', jp: '次へ', romaji: 'Next' },
	previousPage: { en: 'Previous page', jp: '前のページ', romaji: 'Previous page' },
	nextPage: { en: 'Next page', jp: '次のページ', romaji: 'Next page' },
	page: { en: 'Page', jp: 'ページ', romaji: 'Page' },
	of: { en: 'of', jp: '／', romaji: 'of' },
	/* filter labels */
	fGenre: { en: 'Genre', jp: 'ジャンル', romaji: 'Genre' },
	fYear: { en: 'Year', jp: '年', romaji: 'Year' },
	fSeason: { en: 'Season', jp: 'シーズン', romaji: 'Season' },
	fTags: { en: 'Tags', jp: 'タグ', romaji: 'Tags' },
	fFormat: { en: 'Format', jp: '形式', romaji: 'Format' },
	fStatus: { en: 'Status', jp: '状態', romaji: 'Status' },
	fOrigin: { en: 'Origin', jp: '制作国', romaji: 'Origin' },
	fSort: { en: 'Sort', jp: '並び順', romaji: 'Sort' },
	anywhere: { en: 'Anywhere', jp: 'すべて', romaji: 'Anywhere' },
	any: { en: 'Any', jp: 'すべて', romaji: 'Any' },
	anyFilter: { en: 'Any {label}', jp: 'すべての{label}', romaji: 'Any {label}' },
	selectedCount: { en: '{n} selected', jp: '{n}件選択中', romaji: '{n} selected' },
	clearSelection: { en: 'Clear selection', jp: '選択を解除', romaji: 'Clear selection' },
	closeMenu: { en: 'Close {label} menu', jp: '{label}メニューを閉じる', romaji: 'Close {label} menu' },
	sortTrending: { en: 'Trending', jp: '急上昇', romaji: 'Trending' },
	sortPopular: { en: 'Popular', jp: '人気', romaji: 'Popular' },
	sortTopRated: { en: 'Top Rated', jp: '高評価', romaji: 'Top Rated' },
	sortNewest: { en: 'Newest', jp: '新着', romaji: 'Newest' },

	/* continue page */
	continueSubtitle: {
		en: 'Pick up exactly where you left off',
		jp: '続きからすぐに再生',
		romaji: 'Pick up exactly where you left off'
	},
	nothingInProgress: {
		en: 'Nothing in progress yet — start an episode to see it here.',
		jp: 'まだ視聴中の作品はありません。エピソードを再生するとここに表示されます。',
		romaji: 'Nothing in progress yet — start an episode to see it here.'
	},
	browseAnime: { en: 'Browse anime', jp: 'アニメを探す', romaji: 'Browse anime' },

	/* settings page */
	appearance: { en: 'Appearance', jp: '外観', romaji: 'Appearance' },
	general: { en: 'General', jp: '一般', romaji: 'General' },
	anilistSync: { en: 'AniList Sync', jp: 'AniList 同期', romaji: 'AniList Sync' },
	preferencesPersist: {
		en: 'Preferences persist to this device.',
		jp: '設定はこの端末に保存されます。',
		romaji: 'Preferences persist to this device.'
	},
	dark: { en: 'dark', jp: 'ダーク', romaji: 'dark' },
	light: { en: 'light', jp: 'ライト', romaji: 'light' },
	allThemes: { en: 'all', jp: 'すべて', romaji: 'all' },
	motion: { en: 'Motion', jp: 'モーション', romaji: 'Motion' },
	reduceMotion: { en: 'Reduce ambient glow & heavy motion', jp: '環境光と大きな動きを減らす', romaji: 'Reduce ambient glow & heavy motion' },
	autoPlayNext: { en: 'Auto-play next episode', jp: '次のエピソードを自動再生', romaji: 'Auto-play next episode' },
	autoPlayNextText: { en: 'Jump to the next episode when one finishes.', jp: 'エピソード終了後に次へ進みます。', romaji: 'Jump to the next episode when one finishes.' },
	autoNextOnEnd: { en: 'Auto-next on end', jp: '終了時に次へ', romaji: 'Auto-next on end' },
	autoNextOnEndText: { en: 'Advance automatically when the video ends.', jp: '動画終了時に自動で進みます。', romaji: 'Advance automatically when the video ends.' },
	autoSkipIntro: { en: 'Auto skip intro', jp: 'イントロを自動スキップ', romaji: 'Auto skip intro' },
	autoSkipIntroText: { en: 'Trigger Skip Intro as soon as the window is available.', jp: 'イントロが検出され次第スキップします。', romaji: 'Trigger Skip Intro as soon as the window is available.' },
	autoSkipOutro: { en: 'Auto skip outro', jp: 'アウトロを自動スキップ', romaji: 'Auto skip outro' },
	autoSkipOutroText: { en: 'Trigger Skip Outro as soon as the window is available.', jp: 'アウトロが検出され次第スキップします。', romaji: 'Trigger Skip Outro as soon as the window is available.' },
	hideAdult: { en: 'Hide 18+ titles', jp: '18+作品を非表示', romaji: 'Hide 18+ titles' },
	hideAdultText: { en: 'Filter adult content out of every browse, search and list.', jp: '閲覧・検索・リストから成人向け作品を除外します。', romaji: 'Filter adult content out of every browse, search and list.' },
	customTheme: { en: 'Custom theme', jp: 'カスタムテーマ', romaji: 'Custom theme' },
	customThemeText: { en: 'Build your own palette. Saved only on this device.', jp: '独自の配色を作成します。この端末に保存されます。', romaji: 'Build your own palette. Saved only on this device.' },
	applyCustomTheme: { en: 'Apply custom theme', jp: 'カスタムテーマを適用', romaji: 'Apply custom theme' },
	resetCustomTheme: { en: 'Reset colors', jp: '色をリセット', romaji: 'Reset colors' },
	backToPlayer: { en: 'Back to player', jp: 'プレイヤーに戻る', romaji: 'Back to player' },
	airingIn: { en: 'airing in', jp: '放送まで', romaji: 'airing in' },
	airingOn: { en: 'on', jp: '', romaji: 'on' },
	airingAt: { en: 'at', jp: '', romaji: 'at' },
	airingNow: { en: 'is airing now', jp: 'は放送中です', romaji: 'is airing now' },
	compactCards: { en: 'Compact cards', jp: 'コンパクト表示', romaji: 'Compact cards' },
	compactCardsText: { en: 'Tighter card density in grids.', jp: 'グリッドの密度を上げます。', romaji: 'Tighter card density in grids.' },
	preferredAudio: { en: 'Preferred audio track', jp: '優先音声', romaji: 'Preferred audio track' },
	preferredAudioText: { en: 'Default track when picking a server.', jp: 'サーバー選択時の既定音声です。', romaji: 'Default track when picking a server.' },
	searchView: { en: 'Default search view', jp: '検索結果の既定表示', romaji: 'Default search view' },
	searchViewText: { en: 'How search results are displayed.', jp: '検索結果の表示方法です。', romaji: 'How search results are displayed.' },
	watchlistView: { en: 'Default watchlist view', jp: 'ウォッチリストの既定表示', romaji: 'Default watchlist view' },
	watchlistViewText: { en: 'How watchlist entries are displayed.', jp: 'ウォッチリストの表示方法です。', romaji: 'How watchlist entries are displayed.' },
	siteLanguageLabel: { en: 'Site language', jp: '表示言語', romaji: 'Site language' },
	siteLanguageText: { en: 'How titles are displayed.', jp: 'タイトルの表示方法。', romaji: 'How titles are displayed.' },
	defaultEpisodeView: { en: 'Default episode display', jp: '既定のエピソード表示', romaji: 'Default episode display' },
	resetAllSettings: { en: 'Reset all settings', jp: 'すべての設定をリセット', romaji: 'Reset all settings' },
	connected: { en: 'Connected', jp: '接続済み', romaji: 'Connected' },
	active: { en: 'Active', jp: '適用中', romaji: 'Active' },
	anilistUserId: { en: 'AniList ID', jp: 'AniList ID', romaji: 'AniList ID' },
	viewProfile: { en: 'View profile', jp: 'プロフィールを見る', romaji: 'View profile' },
	listStats: { en: 'Your AniList library', jp: 'AniListのライブラリ', romaji: 'Your AniList library' },
	statTotal: { en: 'Total', jp: '合計', romaji: 'Total' },
	statWatching: { en: 'Watching', jp: '視聴中', romaji: 'Watching' },
	statCompleted: { en: 'Completed', jp: '完了', romaji: 'Completed' },
	statPlanned: { en: 'Planned', jp: '計画中', romaji: 'Planned' },
	statDropped: { en: 'Dropped', jp: '中断', romaji: 'Dropped' },
	statPaused: { en: 'Paused', jp: '一時停止', romaji: 'Paused' },
	statRewatching: { en: 'Rewatching', jp: '再視聴', romaji: 'Rewatching' },
	loadingStats: { en: 'Loading…', jp: '読み込み中…', romaji: 'Loading…' },
	anilistSyncExplain: {
		en: 'Sync pushes this device’s watchlist to AniList, then pulls your AniList list back to merge in anything new.',
		jp: '同期でこの端末のウォッチリストをAniListへ送信し、その後AniListのリストを取り込んで新しい項目を統合します。',
		romaji: 'Sync pushes this device’s watchlist to AniList, then pulls your AniList list back to merge in anything new.'
	},
	malSyncExplain: {
		en: 'Sync pushes this device’s watchlist to MyAnimeList, then pulls your MyAnimeList list back to merge in anything new.',
		jp: '同期でこの端末のウォッチリストをMyAnimeListへ送信し、その後MyAnimeListのリストを取り込んで新しい項目を統合します。',
		romaji: 'Sync pushes this device’s watchlist to MyAnimeList, then pulls your MyAnimeList list back to merge in anything new.'
	},
	working: { en: 'Working…', jp: '処理中…', romaji: 'Working…' },
	anilistConnectExplain: {
		en: 'Connect your AniList account to sync your watchlist, scores and progress.',
		jp: 'AniListアカウントを連携すると、ウォッチリスト・スコア・進捗を同期できます。',
		romaji: 'Connect your AniList account to sync your watchlist, scores and progress.'
	},
	malConnectExplain: {
		en: 'Connect your account to sync your watchlist, scores and progress.',
		jp: 'アカウントを連携すると、ウォッチリスト・スコア・進捗を同期できます。',
		romaji: 'Connect your account to sync your watchlist, scores and progress.'
	},

	/* rails / top ten */
	viewAllLower: { en: 'View all', jp: 'すべて見る', romaji: 'View all' },
	topAiring: { en: 'Top Airing', jp: '放送中ランキング', romaji: 'Top Airing' },
	popularNow: { en: 'Popular Now', jp: '人気作品', romaji: 'Popular Now' },
	upcoming: { en: 'Upcoming', jp: '近日公開', romaji: 'Upcoming' },
	topRatedAnime: { en: 'Top Rated', jp: '高評価作品', romaji: 'Top Rated' },
	popularThisSeason: { en: 'Popular This Season', jp: '今期の人気作', romaji: 'Popular This Season' },
	recentlyUpdated: { en: 'Recently Updated', jp: '最新更新', romaji: 'Recently Updated' },
	trendingNow: { en: 'Trending Now', jp: '急上昇中', romaji: 'Trending Now' },
	scrollLeft: { en: 'Scroll left', jp: '左へスクロール', romaji: 'Scroll left' },
	scrollRight: { en: 'Scroll right', jp: '右へスクロール', romaji: 'Scroll right' },
	errTrending: { en: 'Could not load trending titles.', jp: '急上昇作品を読み込めませんでした。', romaji: 'Could not load trending titles.' },
	errSeasonal: { en: 'Could not load seasonal picks.', jp: '今期のおすすめを読み込めませんでした。', romaji: 'Could not load seasonal picks.' },
	errRecent: { en: 'Could not load recent episodes.', jp: '最新エピソードを読み込めませんでした。', romaji: 'Could not load recent episodes.' },
	errAiring: { en: 'Could not load top airing.', jp: '放送中ランキングを読み込めませんでした。', romaji: 'Could not load top airing.' },
	errToday: { en: 'Could not load today’s rankings.', jp: '本日のランキングを読み込めませんでした。', romaji: 'Could not load today’s rankings.' },
	errWeek: { en: 'Could not load weekly rankings.', jp: '週間ランキングを読み込めませんでした。', romaji: 'Could not load weekly rankings.' },
	errMonth: { en: 'Could not load monthly rankings.', jp: '月間ランキングを読み込めませんでした。', romaji: 'Could not load monthly rankings.' },

	removeFromContinue: { en: 'Remove from continue watching', jp: '続きから削除', romaji: 'Remove from continue watching' },
	resumeEpisode: { en: 'Resume {title} episode {n}', jp: '{title} 第{n}話を再開', romaji: 'Resume {title} episode {n}' },

	/* player watchlist menu */
	moveToList: { en: 'Move to list', jp: 'リストを移動', romaji: 'Move to list' },
	addToList: { en: 'Add to list', jp: 'リストに追加', romaji: 'Add to list' },
	removeFromWatchlist: { en: 'Remove from watchlist', jp: 'ウォッチリストから削除', romaji: 'Remove from watchlist' },
	closeWatchlistMenu: { en: 'Close watchlist menu', jp: 'ウォッチリストメニューを閉じる', romaji: 'Close watchlist menu' },

	/* keyboard shortcuts */
	keyboardShortcuts: { en: 'Keyboard shortcuts', jp: 'キーボードショートカット', romaji: 'Keyboard shortcuts' },
	close: { en: 'Close', jp: '閉じる', romaji: 'Close' },
	kPlayPause: { en: 'Play / pause', jp: '再生 / 一時停止', romaji: 'Play / pause' },
	kSeekBack: { en: 'Seek −10s', jp: '10秒戻る', romaji: 'Seek −10s' },
	kSeekFwd: { en: 'Seek +10s', jp: '10秒進む', romaji: 'Seek +10s' },
	kSkipNow: { en: 'Skip intro / outro now', jp: 'イントロ / アウトロを今すぐスキップ', romaji: 'Skip intro / outro now' },
	kPrevEp: { en: 'Previous episode', jp: '前のエピソード', romaji: 'Previous episode' },
	kNextEp: { en: 'Next episode', jp: '次のエピソード', romaji: 'Next episode' },
	kTheater: { en: 'Theater mode', jp: 'シアターモード', romaji: 'Theater mode' },
	kLightMode: { en: 'Light (dim surroundings)', jp: 'ライト（周囲を暗く）', romaji: 'Light (dim surroundings)' },
	kAutoplay: { en: 'Toggle autoplay', jp: '自動再生の切替', romaji: 'Toggle autoplay' },
	kAutoNext: { en: 'Toggle auto-next', jp: '自動次話の切替', romaji: 'Toggle auto-next' },
	kSwitchServers: { en: 'Switch SUB / DUB servers', jp: '字幕 / 吹替サーバーの切替', romaji: 'Switch SUB / DUB servers' },
	kCloseOverlays: { en: 'Close overlays / exit theater', jp: 'オーバーレイを閉じる / シアター終了', romaji: 'Close overlays / exit theater' },
	kSkipNote: {
		en: 'Skip shortcuts work while the page has focus — click back on the page after interacting with the player.',
		jp: 'スキップ操作はページにフォーカスがある間のみ有効です。プレイヤー操作後はページをクリックしてください。',
		romaji: 'Skip shortcuts work while the page has focus — click back on the page after interacting with the player.'
	},

	/* footer */
	footTagline: {
		en: 'AniKage is a free anime streaming site where you can watch anime in HD quality with both subbed and dubbed options, all without the hassle of registration or payment.',
		jp: 'AniKageは、HD画質で日本語字幕と吹替の両方に対応し、登録も支払いも不要な無料でアニメを視聴できるサイトです。',
		romaji: 'AniKage wa muryō de anime o HD shitsu de kanshi suru saito desu. Nihongo jimaku to fukae no ryōgai ni taiō shite, touroku mo harai mo hitsuyō arimasen.'
	},
	terms: { en: 'Terms', jp: '利用規約', romaji: 'Terms' },
	account: { en: 'Account', jp: 'アカウント', romaji: 'Account' },
	browse: { en: 'Browse', jp: 'ブラウズ', romaji: 'Browse' },
	more: { en: 'More', jp: 'その他', romaji: 'More' },
	lander: { en: 'Lander', jp: '概要', romaji: 'Lander' },
	privacy: { en: 'Privacy', jp: 'プライバシー', romaji: 'Privacy' },
	contact: { en: 'Contact', jp: 'お問い合わせ', romaji: 'Contact' },
	footCredit: { en: 'All Rights Reserved.', jp: '無断転載を禁じます。', romaji: 'All Rights Reserved.' },
	sourceCode: { en: 'Source Code', jp: 'ソースコード', romaji: 'Source Code' },
	api: { en: 'API', jp: 'API', romaji: 'API' },
	footDisclaimer: {
		en: 'Anikage does not host any media. All streams are sourced from third-party providers.',
		jp: 'Anikageはメディアを保有していません。すべての配信は第三者プロバイダーから提供されます。',
		romaji: 'Anikage does not host any media. All streams are sourced from third-party providers.'
	},

	/* theme drawer */
	themePicker: { en: 'Theme picker', jp: 'テーマ選択', romaji: 'Theme picker' },
	closeThemePicker: { en: 'Close theme picker', jp: 'テーマ選択を閉じる', romaji: 'Close theme picker' },

	/* player control bar */
	tPrevTip: { en: 'Previous episode (J)', jp: '前のエピソード (J)', romaji: 'Previous episode (J)' },
	tNextTip: { en: 'Next episode (L)', jp: '次のエピソード (L)', romaji: 'Next episode (L)' },
	theater: { en: 'Theater', jp: 'シアター', romaji: 'Theater' },
	tTheaterTip: { en: 'Theater mode (T)', jp: 'シアターモード (T)', romaji: 'Theater mode (T)' },
	ctrlLight: { en: 'Light', jp: 'ライト', romaji: 'Light' },
	tLightTip: { en: 'Light / dim surroundings (D)', jp: 'ライト / 周囲を暗く (D)', romaji: 'Light / dim surroundings (D)' },
	keys: { en: 'Keys', jp: 'キー', romaji: 'Keys' },
	tKeysTip: { en: 'Keyboard shortcuts (?)', jp: 'キーボードショートカット (?)', romaji: 'Keyboard shortcuts (?)' },
	autoplay: { en: 'Autoplay', jp: '自動再生', romaji: 'Autoplay' },
	tAutoplayTip: { en: 'Autoplay (A)', jp: '自動再生 (A)', romaji: 'Autoplay (A)' },
	autoNext: { en: 'Auto-next', jp: '自動次話', romaji: 'Auto-next' },
	tAutoNextTip: { en: 'Auto-next episode (N)', jp: 'エピソード自動送り (N)', romaji: 'Auto-next episode (N)' },
	skipIntro: { en: 'Skip Intro', jp: 'イントロをスキップ', romaji: 'Skip Intro' },
	tSkipIntroTip: { en: 'Auto-skip intros', jp: 'イントロを自動スキップ', romaji: 'Auto-skip intros' },
	skipOutro: { en: 'Skip Outro', jp: 'アウトロをスキップ', romaji: 'Skip Outro' },
	tSkipOutroTip: { en: 'Auto-skip outros', jp: 'アウトロを自動スキップ', romaji: 'Auto-skip outros' },
	previousSlide: { en: 'Previous slide', jp: '前のスライド', romaji: 'Previous slide' },
	nextSlide: { en: 'Next slide', jp: '次のスライド', romaji: 'Next slide' },
	cInWatchlist: { en: 'In your watchlist', jp: 'ウォッチリストに追加済み', romaji: 'In your watchlist' },
	cNotInWatchlist: { en: 'Not in your watchlist', jp: 'ウォッチリスト未追加', romaji: 'Not in your watchlist' },

	/* server selector */
	switchServer: { en: 'Switch server', jp: 'サーバー切替', romaji: 'Switch server' },
	closeServerList: { en: 'Close server list', jp: 'サーバー一覧を閉じる', romaji: 'Close server list' },
	serverAuto: { en: 'Auto', jp: '自動', romaji: 'Auto' },
	noServersIndexed: { en: 'No servers indexed for this episode.', jp: 'このエピソードのサーバーが見つかりません。', romaji: 'No servers indexed for this episode.' },
	loadingServers: { en: 'Loading servers…', jp: 'サーバーを読み込み中…', romaji: 'Loading servers…' },
	reloadingServers: { en: 'Reloading servers…', jp: 'サーバーを再読み込み中…', romaji: 'Reloading servers…' },
	serverLoadOffline: {
		en: 'Stream service unreachable. Check your connection.',
		jp: 'ストリームサービスに接続できません。接続を確認してください。',
		romaji: 'Stream service unreachable. Check your connection.'
	},
	serverLoadTimeout: {
		en: 'Server list took too long to load.',
		jp: 'サーバーの読み込みに時間がかかりすぎました。',
		romaji: 'Server list took too long to load.'
	},
	serverLoadNotFound: {
		en: 'No streams indexed for this episode yet.',
		jp: 'このエピソードのサーバーがまだ登録されていません。',
		romaji: 'No streams indexed for this episode yet.'
	},
	serverLoadFailed: {
		en: 'Could not load servers.',
		jp: 'サーバーを読み込めませんでした。',
		romaji: 'Could not load servers.'
	},
	switchCategory: { en: 'Switch category', jp: 'カテゴリ切替', romaji: 'Switch category' },
	category: { en: 'Category', jp: 'カテゴリ', romaji: 'Category' },
	noServersInCategory: { en: 'No servers in this category.', jp: 'このカテゴリにサーバーはありません。', romaji: 'No servers in this category.' },

	/* misc aria */
	watchEpisode1: { en: 'Watch episode 1', jp: '第1話を視聴', romaji: 'Watch episode 1' },
	profileMenu: { en: 'Profile menu', jp: 'プロフィールメニュー', romaji: 'Profile menu' },
	videoPlayer: { en: 'Video player', jp: 'ビデオプレーヤー', romaji: 'Video player' },
	featuredAnime: { en: 'Featured anime', jp: '注目のアニメ', romaji: 'Featured anime' },
	closeRangeMenu: { en: 'Close range menu', jp: '範囲メニューを閉じる', romaji: 'Close range menu' },
	jumpToEpisode: { en: 'Jump to episode', jp: 'エピソードへ移動', romaji: 'Jump to episode' },

	/* auth callback */
	anilistSignIn: { en: 'AniList Sign-in', jp: 'AniList ログイン', romaji: 'AniList Sign-in' },
	completingSignIn: { en: 'Completing AniList sign-in…', jp: 'AniListログインを完了しています…', romaji: 'Completing AniList sign-in…' },
	noAuthCode: { en: 'No authorization code returned.', jp: '認証コードが返されませんでした。', romaji: 'No authorization code returned.' },
	signInFailed: { en: 'Sign-in failed.', jp: 'ログインに失敗しました。', romaji: 'Sign-in failed.' },
	backToSettings: { en: 'Back to settings', jp: '設定に戻る', romaji: 'Back to settings' },
	watchedCount: { en: '{n} / {total} watched', jp: '{n} / {total} 視聴済み', romaji: '{n} / {total} watched' },

	/* info labels */
	share: { en: 'Share', jp: '共有', romaji: 'Share' },
	shareLink: { en: 'Link', jp: 'リンク', romaji: 'Link' },
	copyLink: { en: 'Copy link', jp: 'リンクをコピー', romaji: 'Copy link' },
	linkCopied: { en: 'Link copied', jp: 'リンクをコピーしました', romaji: 'Link copied' },
	trailer: { en: 'Trailer', jp: '予告編', romaji: 'Trailer' },
	related: { en: 'Related', jp: '関連作品', romaji: 'Related' },
	recommendations: { en: 'Recommended', jp: 'おすすめ', romaji: 'Recommended' },
	cast: { en: 'Cast', jp: 'キャスト', romaji: 'Cast' },
	voiceActor: { en: 'Voice', jp: '声優', romaji: 'Voice' },
	browseSections: { en: 'Sections', jp: 'セクション', romaji: 'Sections' },
	format: { en: 'Format', jp: '形式', romaji: 'Format' },
	started: { en: 'Started', jp: '放送開始', romaji: 'Started' },
	studio: { en: 'Studio', jp: 'スタジオ', romaji: 'Studio' },
	duration: { en: 'Duration', jp: '再生時間', romaji: 'Duration' },
	season: { en: 'Season', jp: 'シーズン', romaji: 'Season' },
	eps: { en: 'eps', jp: '話', romaji: 'eps' },
	min: { en: 'min', jp: '分', romaji: 'min' }
};

/** Translate a known UI key into the active language. */
export function t(key: keyof typeof STRINGS | string, l: Lang = 'en'): string {
	const entry = STRINGS[key];
	if (!entry) return String(key);
	return entry[l] ?? entry.en;
}

/** Translate a key and substitute `{name}` tokens with the given values. */
export function tf(
	key: keyof typeof STRINGS | string,
	vars: Record<string, string | number>,
	l: Lang = 'en'
): string {
	return t(key, l).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** Pick the display title for an anime based on the active language. */
export function titleFor(a: Anime, l: Lang = 'en'): string {
	switch (l) {
		case 'jp':
			return a.title.native || a.title.romaji || a.display;
		case 'romaji':
			return a.title.romaji || a.display;
		default:
			return a.display;
	}
}
