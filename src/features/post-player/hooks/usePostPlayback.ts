/**
 * PostCard playback orchestrator: composes page timing, advance, ring, entrance.
 *
 * Exports: usePostPlayback, UsePostPlaybackResult
 * Depends on: useCommentFlow, useCommentStory, useTextFitScale, usePostExport, sibling hooks
 */

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { parseCanvas } from "@/features/canvas";
import { shouldFloatComment } from "../lib/comment-text";
import { getUniformPageTextSize } from "../lib/playback-timing";
import { paginateText } from "../lib/paginate";
import { getPostShareUrl } from "../lib/post-meta";
import type { PostCardProps } from "../types";
import { buildPostPlaybackApi } from "./buildPostPlaybackApi";
import { useCommentFlow } from "./useCommentFlow";
import { useCommentStory } from "./useCommentStory";
import { usePostAutoAdvance } from "./usePostAutoAdvance";
import { usePostEntrance } from "./usePostEntrance";
import { usePostExport, type UsePostExportArgs, type UsePostExportResult } from "./usePostExport";
import { usePostPageTiming } from "./usePostPageTiming";
import { usePostPlaybackDerived } from "./usePostPlaybackDerived";
import { usePostRingProgress } from "./usePostRingProgress";
import { useTextFitScale } from "./useTextFitScale";

const NO_EXPORT: UsePostExportResult = { handleExportVideo: async () => {} };

// Video export is a local admin tool: a production build keeps no recorder at all.
const useExportFlow: (args: UsePostExportArgs) => UsePostExportResult = import.meta.env.DEV
  ? usePostExport
  : () => NO_EXPORT;

/**
 * Compose PostCard runtime hooks and preserve original effect order.
 * @param props - PostCard props (post, author, engagement, handlers)
 * @returns Flat playback API for PostCard layers
 */
export function usePostPlayback(props: PostCardProps) {
  const { post, author, likes, comments, liked, profilesById, currentUserId, onLike, onComment } =
    props;
  const spec = parseCanvas(post.canvas_html);
  const textPages = useMemo(() => paginateText(spec.text), [spec.text]);
  const storyIndexApiRef = useRef<{
    setStoryIndex: Dispatch<SetStateAction<number>>;
    commentStoriesLength: number;
  } | null>(null);
  const [slide, setSlide] = useState(0);
  const [textPage, setTextPage] = useState(0);
  const [playKey, setPlayKey] = useState(0);
  const [backgroundShiftPage, setBackgroundShiftPage] = useState(0);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [pageRevealed, setPageRevealed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(390);
  const [canvasEl, setCanvasEl] = useState<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const media = post.media_urls ?? [];

  const commentFlow = useCommentFlow({
    comments,
    postId: post.id,
    currentUserId,
    onComment,
    storyIndexApiRef,
  });
  const commentStory = useCommentStory({
    chronologicalComments: commentFlow.chronologicalComments,
    showChips: commentFlow.showChips,
    customCommentHasText: commentFlow.customCommentHasText,
  });
  storyIndexApiRef.current = {
    setStoryIndex: commentStory.setStoryIndex,
    commentStoriesLength: commentStory.commentStories.length,
  };

  const ring = usePostRingProgress({
    onLike,
    setIsPaused,
    setActionMenuOpen,
    setShowChips: commentFlow.setShowChips,
    setActiveComment: commentFlow.setActiveComment,
  });

  const currentText = textPages[textPage] ?? textPages[0] ?? "";
  const uniformPageSize = useMemo(
    () => getUniformPageTextSize(spec.size, textPages, spec.text),
    [spec.size, textPages, spec.text],
  );
  const showingFlyingComment =
    !isExporting &&
    !isPaused &&
    !!commentFlow.activeComment &&
    shouldFloatComment(commentFlow.activeCommentLabel);

  function showNextTextPage(revealed: boolean): void {
    if (textPages.length < 2) {
      setPageRevealed(revealed);
      setPlayKey((k) => k + 1);
      return;
    }
    const nextPage = (textPage + 1) % textPages.length;
    setTextPage(nextPage);
    setBackgroundShiftPage((p) => p + 1);
    setPageRevealed(revealed);
    if (post.post_type === "slideshow" && media.length > 1) setSlide(nextPage % media.length);
    setPlayKey((k) => k + 1);
  }

  function selectTextPage(page: number): void {
    setIsPaused(false);
    setTextPage(page);
    setBackgroundShiftPage(page);
    setPageRevealed(false);
    if (post.post_type === "slideshow" && media.length > 1) setSlide(page % media.length);
    setPlayKey((k) => k + 1);
  }

  const entrance = usePostEntrance({
    showingFlyingComment,
    setCommentOverlapsInfo: commentFlow.setCommentOverlapsInfo,
    isExporting,
    isPaused,
    pageRevealed,
    setIsPaused,
    setPageRevealed,
    setPlayKey,
    setActiveComment: commentFlow.setActiveComment,
    setShowChips: commentFlow.setShowChips,
    setActionMenuOpen,
    showNextTextPage,
    setTextPage,
    setBackgroundShiftPage,
    setSlide,
  });

  const textFit = useTextFitScale({ textPages, uniformPageSize, canvasWidth, currentText });

  const derived = usePostPlaybackDerived({
    post,
    spec,
    textPages,
    media,
    textPage,
    backgroundShiftPage,
    canvasWidth,
    likes,
    chronologicalCommentsLength: commentFlow.chronologicalComments.length,
    isExporting,
    isPaused,
    activeComment: commentFlow.activeComment,
    activeCommentLabel: commentFlow.activeCommentLabel,
    profilesById,
    displaySize: textFit.displaySize,
  });

  usePostPageTiming({
    post,
    spec,
    textPages,
    media,
    currentText,
    textPage,
    setTextPage,
    setBackgroundShiftPage,
    setSlide,
    setPlayKey,
    isPaused,
    setIsPaused,
    isVisible,
    setIsVisible,
    pageRevealed,
    setPageRevealed,
    isExporting,
    setIsExporting,
    setActionMenuOpen,
    canvasEl,
    canvasRef,
    setCanvasWidth,
    comments,
    setLocalComments: commentFlow.setLocalComments,
    setStoryOpen: commentStory.setStoryOpen,
    setStoryIndex: commentStory.setStoryIndex,
    setStoryPage: commentStory.setStoryPage,
    setStoryFastMode: commentStory.setStoryFastMode,
    commentStoriesLength: commentStory.commentStories.length,
    resetCollectionPicker: ring.resetCollectionPicker,
  });

  usePostAutoAdvance({
    isExporting,
    isPaused,
    isVisible,
    storyOpen: commentStory.storyOpen,
    commentFlowKey: commentFlow.commentFlowKey,
    floatingComments: commentFlow.floatingComments,
    setActiveComment: commentFlow.setActiveComment,
    manualCommentHoldUntil: commentFlow.manualCommentHoldUntil,
    storyPlayerActive: commentStory.storyPlayerActive,
    storyFastMode: commentStory.storyFastMode,
    storyIndex: commentStory.storyIndex,
    setStoryPage: commentStory.setStoryPage,
    setStoryPlayKey: commentStory.setStoryPlayKey,
    setStoryIndex: commentStory.setStoryIndex,
    normalizedCustomComment: commentFlow.normalizedCustomComment,
    setDraftCommentPage: commentFlow.setDraftCommentPage,
    setDraftCommentPlayKey: commentFlow.setDraftCommentPlayKey,
    showChips: commentFlow.showChips,
    customCommentHasText: commentFlow.customCommentHasText,
    draftCommentPages: commentFlow.draftCommentPages,
    draftCommentPageText: commentFlow.draftCommentPageText,
    draftCommentPlayKey: commentFlow.draftCommentPlayKey,
    activeStory: commentStory.activeStory,
    storyPages: commentStory.storyPages,
    commentStoriesLength: commentStory.commentStories.length,
    storyPage: commentStory.storyPage,
    storyPageText: commentStory.storyPageText,
  });

  useEffect(() => {
    if (post.post_type !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    if (isPaused || !isVisible) {
      video.pause();
      return;
    }
    video.play().catch(() => undefined);
  }, [isPaused, isVisible, post.post_type]);

  const { handleExportVideo } = useExportFlow({
    post,
    textPages,
    tempo: spec.tempo,
    rhythm: spec.rhythm,
    isExporting,
    setIsExporting,
    setActionMenuOpen,
    setShowChips: commentFlow.setShowChips,
    setShowQuickCommentChips: commentFlow.setShowQuickCommentChips,
    setShowCollectionPicker: ring.setShowCollectionPicker,
    setStoryOpen: commentStory.setStoryOpen,
    setActiveComment: commentFlow.setActiveComment,
    setCommentOverlapsInfo: commentFlow.setCommentOverlapsInfo,
    setIsPaused,
    setPageRevealed,
    setTextPage,
    setBackgroundShiftPage,
    setSlide,
    setPlayKey,
  });

  return buildPostPlaybackApi({
    post,
    author,
    likes,
    liked,
    comments,
    profilesById,
    spec,
    textPages,
    slide,
    textPage,
    playKey,
    backgroundShiftPage,
    actionMenuOpen,
    setActionMenuOpen,
    isPaused,
    isVisible,
    pageRevealed,
    isExporting,
    canvasWidth,
    canvasRef,
    setCanvasEl,
    videoRef,
    postUrl: getPostShareUrl(post.id),
    media,
    ring,
    entrance,
    derived,
    textFit,
    commentFlow,
    commentStory,
    handleExportVideo,
    selectTextPage,
    setIsPaused,
    setPageRevealed,
  });
}

export type UsePostPlaybackResult = ReturnType<typeof usePostPlayback>;
