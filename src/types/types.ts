// ============================================================================
// Basic Type Definitions
// ============================================================================

/**
 * Different modes of poll selection
 */
export type PollSelectionMode = 'pollList' | 'manual';

/**
 * Actions that can be performed on a poll
 */
export type PollAction = 'add' | 'remove' | 'set' | 'restore' | 'rename' | 'renamePoll' | 'reset';
export type PauseAction = 'pause' | 'unpause';
export type PollStatus = 'stop' | 'start';
export type VisibilityAction = 'show' | 'hide';
export type BackupAction = 'restore' | 'remove';

// ============================================================================
// Base Interfaces
// ============================================================================

/**
 * Configuration for handling emojis in polls
 */
export interface EmojiSettings {
    fromTitle: boolean;
    fromOptions: boolean;
}

/**
 * Custom coordinates for poll positioning
 */
export interface CustomCoords {
    top: number | null;
    bottom: number | null;
    left: number | null;
    right: number | null;
}

/**
 * Base configuration for a poll option
 */
export interface BasePollOption {
    option_number: number;
    option_name: string;
}

/**
 * Extended poll option with vote count
 */
export interface PollOption extends BasePollOption {
    votes: number;
}

/**
 * Represents a removed poll option with additional tracking information
 */
export interface RemovedOption extends PollOption {
    removedAt: string;
    originalPollId: string;
    formerNumber: number;
}

// ============================================================================
// Display & Style Configuration
// ============================================================================

/**
 * Controls the visual display settings of a poll
 */
export interface PollDisplay {
    showVoteCount: boolean;
    showPercentages: boolean;
    showVotingCommand: boolean;
    animateProgress: boolean;
    removeEmojis: EmojiSettings;
}

/**
 * Visual styling configuration for polls
 */
export interface PollStyles {
    backgroundColor: string;
    accentColor: string;
    optionColor: string;
    titleColor: string;
    fontSize: string;
    trackColor: string;
    progressColor: string;
    shadowColor: string;
    progressTextColor: string;
    pollWidth?: string;
    pollScale: number;
    customCSS?: string;
}

// ============================================================================
// Poll Configuration
// ============================================================================

/**
 * Configuration for poll options and behavior
 */
export interface PollOptionsConfig {
    optionsList: BasePollOption[];
    votingCommand: string;
    resetOnLoad: boolean;
    autoClose: boolean;
    duration: number;
    displayDuration: number;
    useTextArea: boolean;
    textAreaInput: string;
    allowMultipleVotes: boolean;
}

/**
 * Core poll data structure
 */
export interface PollData {
    options: PollOption[];
    total_votes: number;
    title: string;
    votingCommand: string;
    display: PollDisplay;
    styles: PollStyles;
}

/**
 * Base configuration for creating/updating polls
 */
export interface BasePollConfig {
    pollTitle: string;
    styles: PollStyles;
    display: PollDisplay;
    position: string;
    customCoords: CustomCoords;
    overlayInstance: string;
}

/**
 * Complete poll configuration including options and data
 */
export interface PollConfig extends BasePollConfig {
    oldPollTitle?: string;
    pollOptions: PollOptionsConfig;
    pollData?: PollData;
}

// ============================================================================
// State & Events
// ============================================================================

/**
 * Represents the current state of a poll
 */
export interface PollState {
    uuid: string;
    pollData: PollData;
    ended: boolean;
    paused: boolean;
    createdAt: string;
    updatedAt: string;
    closeTime?: string;
    displayDuration: number;
    position: string;
    customCoords: CustomCoords;
    overlayInstance: string;
    allowMultipleVotes: boolean;
    voters: Record<string, Record<number, number>>;
}

/**
 * Backup poll extention
 */
export interface BackupPoll extends PollState {
    removedAt: string;
    id?: string;
}

// ============================================================================
// Event Metadata
// ============================================================================

/**
 * Various metadata interfaces for poll events
 */

export interface PollStartMetadata {
    pollId: string;
    pollTitle: string;
    options: string[];
    duration: number;
}

export interface PollUpdateMetadata {
    pollId: string;
    pollTitle: string;
    options: Array<Pick<PollOption, 'option_name' | 'votes'>>;
    totalVotes: number;
    timeRemaining: number;
}

// ============================================================================
// Effect Models
// ============================================================================

/**
 * Base model for poll effects
 */
export interface BaseEffectModel extends BasePollConfig {
    pollSelectionMode: PollSelectionMode;
    manualPollTitle?: string;
}

/**
 * Model for vote update effects
 */
export interface VoteUpdateModel extends BaseEffectModel {
    action: PollAction;
    mode: string;
    optionNumber?: number;
    voteCount?: number;
    newOptionName?: string;
    newName?: string;
    newPollTitle: string;
    pollOptions: {
        optionsList: PollOption[];
        votingCommand?: string;
        allowMultipleVotes?: boolean;
    };
    pauseAction?: PauseAction;
    pollStatus?: PollStatus;
    visibilityAction?: VisibilityAction;
    username?: string;
    setting?: SettingUpdate;
}

/**
 * Setting update types
 */
export type SettingUpdate = BooleanSetting | CommandSetting | StyleSetting;

export interface BooleanSetting {
    type: 'allowMultipleVotes' | 'showVoteCount' | 'showPercentages' | 
          'showVotingCommand' | 'animateProgress' | 'removeEmojisFromTitle' | 
          'removeEmojisFromOptions';
    value: boolean;
}

export interface StyleSetting {
    type: 'backgroundColor' | 'accentColor' | 'optionColor' | 'titleColor' | 
          'trackColor' | 'progressColor' | 'shadowColor' | 'progressTextColor' | 
          'pollScale';
    value: string | number;
}

export interface CommandSetting {
    type: 'votingCommand';
    value: string;
}

/**
 * Model for backup effects
 */
export interface BackupEffectModel {
    mode?: string;
    pollSelectionMode: string;
    manualPollTitle: string;
    action: BackupAction;
}

/**
 * Model for general effects
 */
export interface EffectModel extends BasePollConfig {
    pollOptions: PollOptionsConfig;
}

/**
 * Event-related data structures
 */
export interface EventData {
    uuid: string;
    config: PollConfig;
    paused?: boolean;
    overlayInstance: string | null;
}

export interface PollTitleInfo {
    pollId: string;
    displayTitle: string;
}