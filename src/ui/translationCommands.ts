import { openAuthWindow } from "../core/authWindow";
import { localizationProvider } from "../localization/localizationProvider";
import type { Status } from "../types/components/votButton";
import { deleteExpiredAccount } from "../utils/account";
import debug from "../utils/debug";
import { isAbortError } from "../utils/errors";
import type { VideoHandler } from "../VideoHandler";
import VOTLocalizedError from "../VOTLocalizedError";

type TranslationButtonCommandDeps = {
  videoHandler?: VideoHandler;
  currentStatus: Status;
  currentLoading: boolean;
  transformBtn(status: Status, text: string): void;
};

async function getVideoDataForTranslation(
  videoHandler: VideoHandler,
  isCurrentContext: () => boolean,
) {
  if (!videoHandler.videoData?.videoId) {
    throw new VOTLocalizedError("VOTNoVideoIDFound");
  }

  if (shouldRefreshVideoDataBeforeTranslation(videoHandler)) {
    const previousVideoData = videoHandler.videoData;
    const refreshedVideoData = await videoHandler.getVideoData();
    if (!isCurrentContext() || videoHandler.videoData !== previousVideoData) {
      return undefined;
    }
    videoHandler.videoData = refreshedVideoData;
  }

  if (!videoHandler.videoData?.videoId) {
    throw new VOTLocalizedError("VOTNoVideoIDFound");
  }

  return videoHandler.videoData;
}

function shouldRefreshVideoDataBeforeTranslation(videoHandler: VideoHandler) {
  return (
    (videoHandler.site.host === "vk" &&
      videoHandler.site.additionalData === "clips") ||
    videoHandler.site.host === "douyin"
  );
}

async function prepareAuthStateForTranslation(
  videoHandler: VideoHandler,
): Promise<void> {
  // Missing account and expired session are different states. Live voices may be
  // requested without an account, but an expired saved session should be shown to
  // the user explicitly instead of falling through to a generic login-required
  // backend response.
  const expired = await deleteExpiredAccount(videoHandler);
  if (!expired) {
    return;
  }

  openAuthWindow();
  throw new VOTLocalizedError("VOTYandexTokenExpired");
}

export async function handleTranslationButtonCommand(
  deps: TranslationButtonCommandDeps,
) {
  const videoHandler = deps.videoHandler;
  if (!videoHandler) {
    return;
  }

  const currentVideoData = videoHandler.videoData;
  const currentVideoElement = videoHandler.video;
  const currentSource = currentVideoElement?.currentSrc || currentVideoElement?.src;
  const currentPageUrl = globalThis.location?.href;
  const currentAbortController = videoHandler.actionsAbortController;
  const currentSignal = currentAbortController.signal;
  const signalWasAborted = currentSignal.aborted;
  const currentGeneration = videoHandler.actionsGeneration;
  const isCurrentContext = () =>
    (signalWasAborted || !currentSignal.aborted) &&
    videoHandler.actionsAbortController === currentAbortController &&
    videoHandler.actionsGeneration === currentGeneration &&
    videoHandler.video === currentVideoElement &&
    (videoHandler.video?.currentSrc || videoHandler.video?.src) ===
      currentSource &&
    globalThis.location?.href === currentPageUrl;

  debug.log("[handleTranslationBtnClick] click translationBtn");
  if (videoHandler.hasActiveSource()) {
    debug.log("[handleTranslationBtnClick] video has active source");
    await videoHandler.stopTranslation();
    return;
  }

  // A click on an errored, idle button is the retry action: reset the button
  // and fall through to translation in this same click instead of taking the
  // stop/abort branch (which would kill background preparation).
  const isRetry = deps.currentStatus === "error" && !deps.currentLoading;
  if (isRetry) {
    deps.transformBtn("none", localizationProvider.get("translateVideo"));
  }

  if (!isRetry && (deps.currentStatus !== "none" || deps.currentLoading)) {
    debug.log("[handleTranslationBtnClick] translationBtn isn't in none state");
    videoHandler.actionsAbortController.abort();
    await videoHandler.stopTranslation();
    return;
  }

  try {
    await prepareAuthStateForTranslation(videoHandler);
    if (!isCurrentContext() || videoHandler.videoData !== currentVideoData) {
      return;
    }

    debug.log("[handleTranslationBtnClick] trying execute translation");
    const videoData = await getVideoDataForTranslation(
      videoHandler,
      isCurrentContext,
    );
    if (!videoData) return;

    // Automatic fallback belongs only to the video where it was selected.
    // Reset it before resolving the language of a newly opened video.
    if (
      videoHandler.autoSourceLanguageOverrideVideoId &&
      videoHandler.autoSourceLanguageOverrideVideoId !== videoData.videoId
    ) {
      videoHandler.translateFromLang = "auto";
      videoHandler.autoSourceLanguageOverrideVideoId = undefined;
      videoHandler.setSelectMenuValues("auto", videoData.responseLanguage);
    }

    await videoHandler.videoManager.ensureDetectedLanguageForTranslation(
      videoData,
    );
    if (!isCurrentContext() || videoHandler.videoData !== videoData) {
      return;
    }

    debug.log(
      "[handleTranslationBtnClick] Run translateFunc",
      videoData.videoId,
    );
    const requestLang =
      videoHandler.translateFromLang === "auto"
        ? videoData.detectedLanguage
        : videoHandler.translateFromLang;

    await videoHandler.translateFunc(
      videoData.videoId,
      videoData.isStream,
      requestLang,
      videoData.responseLanguage,
      videoData.translationHelp,
    );
  } catch (err) {
    if (!isCurrentContext()) return;
    if (isAbortError(err)) {
      deps.transformBtn("none", localizationProvider.get("translateVideo"));
      return;
    }

    console.error("[VOT]", err);
    if (!(err instanceof Error)) {
      deps.transformBtn("error", String(err));
      return;
    }

    const message =
      err.name === "VOTLocalizedError"
        ? (err as VOTLocalizedError).localizedMessage
        : err.message;
    deps.transformBtn("error", message);
  }
}
