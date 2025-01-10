import { Firebot } from "@crowbartools/firebot-custom-scripts-types";
import { EventData, PollOption, PollState, EffectModel } from "../types/types";
import { votingManager } from "../utility/voting-manager";
import mainTemplate from "../templates/main-template.html";
import { logger } from "../logger";
import { randomUUID } from "crypto";
import { webServer, settings, modules } from "../main";

// Define the default state for a new poll
let currentPollState: PollState = {
    uuid: '',  // Unique identifier for the poll
    pollData: {
        options: [],  // Array to store poll options
        total_votes: 0,  // Counter for total votes received
        title: '',  // Poll title
        votingCommand: '',  // Command users will use to vote
        // Display configuration for the poll
        display: {
            showVoteCount: true,    // Whether to show number of votes
            showPercentages: true,  // Whether to show percentage for each option
            showVotingCommand: true, // Whether to display the voting command
            animateProgress: true,   // Whether to animate progress bars
            removeEmojis: {
                fromTitle: false,   // Whether to strip emojis from poll title
                fromOptions: false  // Whether to strip emojis from options
            }
        },
        // Visual styling configuration
        styles: {
            backgroundColor: "rgba(17, 17, 17, 1)", // Background color
            accentColor: "#a60000",                 // Accent color for highlights
            optionColor: "#e3e3e3",                 // Color for option text
            titleColor: "#e3e3e3",                  // Color for poll title
            fontSize: "24px",                       // Base font size
            pollWidth: "300px",                     // Width of poll container
            trackColor: "#e9e9e9",                  // Color for progress track
            progressColor: "#a60000",               // Color for progress bar
            shadowColor: "#a60000",                 // Color for text shadows
            progressTextColor: "#000000",           // Color for progress text
            pollScale: 1,                           // Scale factor for entire poll
            customCSS: ""                           // Custom CSS overwrites
        }
    },
    ended: false,        // Whether the poll has ended
    paused: false,       // Whether the poll is paused
    createdAt: '',       // Timestamp for poll creation
    updatedAt: '',       // Timestamp for last update
    displayDuration: 30, // How long to display after completion
    position: 'Middle',  // Position on screen
    customCoords: {      // Custom positioning coordinates
        top: null,
        bottom: null,
        left: null,
        right: null
    },
    overlayInstance: '', // Specific overlay instance to use
    allowMultipleVotes: false, // Whether users can vote multiple times
    voters: {}           // Track who has voted
};

/**
 * Generates a random integer between min and max (inclusive)
 */
function getRandomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random preset position for the poll
 */
function getRandomPresetLocation(): string {
    const presetPositions = [
        'Top Left', 'Top Middle', 'Top Right',
        'Middle Left', 'Middle', 'Middle Right',
        'Bottom Left', 'Bottom Middle', 'Bottom Right'
    ];
    const randomIndex = getRandomInt(0, presetPositions.length - 1);
    return presetPositions[randomIndex];
}

/**
 * Defines and exports the voting system effect type for Firebot
 */
export function votingSystemEffectType() {
    const effectType: Firebot.EffectType<EffectModel> = {
        // Effect definition including metadata and triggers
        definition: {
            id: "msgg:voting-system",
            name: "Advanced Poll System",
            description: "Display a highly customizable voting/poll overlay",
            icon: "fad fa-poll-h",
            categories: ["overlay"],
            dependencies: [],
            // Supported trigger types
            triggers: {
                command: true,
                custom_script: true,
                startup_script: true,
                api: true,
                event: true,
                hotkey: true,
                timer: true,
                counter: true,
                preset: true,
                manual: true,
            },
            outputs: []
        },

        // Template for options UI
        optionsTemplate: mainTemplate,

        /**
         * Controller for handling the options interface
         * Manages the UI state and interactions for poll configuration
         */
        optionsController: ($scope: any, backendCommunicator: any, utilityService: any) => {
            // Default style configurations
            const DEFAULT_STYLES = {
                backgroundColor: "#111111",
                accentColor: "#a60000",
                optionColor: "#e3e3e3",
                titleColor: "#e3e3e3",
                fontSize: "24px",
                shadowColor: "#a60000",
                progressColor: "#a60000",
                trackColor: "#e9e9e9",
                progressTextColor: "#000000",
                pollScale: 1
            };

            // Default display settings
            const DEFAULT_DISPLAY = {
                showVoteCount: true,
                showPercentages: true,
                showVotingCommand: true,
                animateProgress: true,
                removeEmojis: {
                    fromTitle: false,
                    fromOptions: false
                }
            };

            // Default poll options
            const DEFAULT_POLL_OPTIONS = {
                optionsList: [],
                votingCommand: "!vote",
                autoClose: false,
                duration: 60,
                displayDuration: 30
            };

            // Available position options
            const POSITIONS = [
                'Random',
                'Top Left', 'Top Middle', 'Top Right',
                'Middle Left', 'Middle', 'Middle Right',
                'Bottom Left', 'Bottom Middle', 'Bottom Right',
                'Custom'
            ];

            /**
             * Initializes default values for the poll configuration
             */
            function initializeDefaults() {
                $scope.effect.styles = { ...$scope.effect.styles || DEFAULT_STYLES };
                $scope.effect.display = {
                    ...$scope.effect.display || DEFAULT_DISPLAY,
                    removeEmojis: {
                        ...DEFAULT_DISPLAY.removeEmojis,
                        ...($scope.effect.display?.removeEmojis || {})
                    }
                };
                $scope.effect.pollOptions = {
                    ...DEFAULT_POLL_OPTIONS,
                    ...($scope.effect.pollOptions || {}),
                    optionsList: $scope.effect.pollOptions?.optionsList || []
                };
                $scope.positions = POSITIONS;
            }

            /**
             * Adds a new option to the poll
             */
            function addOption() {
                const optionsList = $scope.effect.pollOptions.optionsList;
                optionsList.push({
                    option_name: "",
                    option_number: optionsList.length + 1
                });
            }

            /**
             * Removes an option from the poll and renumbers remaining options
             */
            function removeOption(index: number) {
                const optionsList = $scope.effect.pollOptions.optionsList;
                optionsList.splice(index, 1);
                // Renumber remaining options
                optionsList.forEach((opt: { option_number: number }, idx: number) => {
                    opt.option_number = idx + 1;
                });
            }

            /**
             * Loads existing poll data if available
             */
            function loadExistingPollData() {
                if (!$scope.effect.pollTitle) return;

                const sanitizedTitle = $scope.effect.pollTitle.replace(/[^a-zA-Z0-9]/g, '_');
                const pollId = `poll_${sanitizedTitle}`;

                backendCommunicator.fireEventAsync("getPollData", pollId)
                    .then((pollData: any) => {
                        if (!pollData?.pollData) return;

                        // Update styles from existing poll
                        if (pollData.pollData.styles) {
                            $scope.effect.styles = { ...pollData.pollData.styles };
                        }

                        // Update display settings from existing poll
                        if (pollData.pollData.display) {
                            $scope.effect.display = {
                                showVoteCount: pollData.pollData.display.showVoteCount ?? true,
                                showPercentages: pollData.pollData.display.showPercentages ?? true,
                                showVotingCommand: pollData.pollData.display.showVotingCommand ?? true,
                                animateProgress: pollData.pollData.display.animateProgress ?? true,
                                removeEmojis: {
                                    fromTitle: pollData.pollData.display.removeEmojis?.fromTitle ?? false,
                                    fromOptions: pollData.pollData.display.removeEmojis?.fromOptions ?? false
                                }
                            };
                        }

                        // Update options from existing poll
                        if (pollData.pollData.options) {
                            $scope.effect.pollOptions.optionsList = pollData.pollData.options.map((opt: PollOption) => ({
                                option_name: opt.option_name,
                                option_number: opt.option_number
                            }));
                        }
                    })
                    .catch((error: Error) => {
                        console.error('Error loading poll data:', error);
                    });
            }

            // Initialize the controller
            initializeDefaults();
            loadExistingPollData();

            // Expose methods to the scope
            $scope.addOption = addOption;
            $scope.removeOption = removeOption;
            $scope.showOverlayInfoModal = (overlayInstance: any) => {
                utilityService.showOverlayInfoModal(overlayInstance);
            };
        },

        /**
         * Validates the poll configuration
         */
        optionsValidator: (effect: EffectModel) => {
            const errors = [];
            if (effect.pollTitle == null || effect.pollTitle === "") {
                errors.push("Please provide a poll title");
            }
            if (effect.pollOptions.autoClose && (!effect.pollOptions.duration || effect.pollOptions.duration <= 0)) {
                errors.push("Please provide a valid duration for auto-close");
            }
            return errors;
        },

        /**
         * Handles the actual triggering of the poll effect
         */
        onTriggerEvent: async (event) => {
            const sanitizedTitle = event.effect.pollTitle.replace(/[^a-zA-Z0-9]/g, '_');
            const pollId = `poll_${sanitizedTitle}`;

            let pollOptions = event.effect.pollOptions.optionsList;

            // Handle text area input if enabled
            if (event.effect.pollOptions.useTextArea) {
                const input = event.effect.pollOptions.textAreaInput;
                if (input) {
                    pollOptions = input.split('\n')
                        .filter((line: string) => line.trim())
                        .map((line: string, index: number) => ({
                            option_name: line.trim(),
                            option_number: index + 1
                        }));
                }
            }

            try {
                // Handle random position selection
                if (event.effect.position === 'Random') {
                    event.effect.position = getRandomPresetLocation();
                }

                const existingPoll = await votingManager.getPoll(pollId);

                if (existingPoll) {
                    // Update existing poll
                    await votingManager.updateOptions(pollId, pollOptions);

                    // Update poll configuration
                    existingPoll.pollData = {
                        ...existingPoll.pollData,
                        votingCommand: event.effect.pollOptions.votingCommand,
                        display: event.effect.display,
                        styles: event.effect.styles,
                    };
                    existingPoll.ended = false;
                    existingPoll.paused = false;
                    existingPoll.updatedAt = new Date().toISOString();
                    existingPoll.closeTime = event.effect.pollOptions.autoClose ?
                        new Date(Date.now() + (event.effect.pollOptions.duration * 1000)).toISOString() :
                        undefined;
                    existingPoll.displayDuration = event.effect.pollOptions.displayDuration;
                    existingPoll.position = event.effect.position;
                    existingPoll.customCoords = event.effect.customCoords;
                    existingPoll.overlayInstance = event.effect.overlayInstance || '';

                    await votingManager.startPoll(pollId, modules.eventManager);
                    currentPollState = existingPoll;
                } else {
                    // Create new poll
                    currentPollState = {
                        uuid: randomUUID(),
                        pollData: {
                            options: pollOptions.map(opt => ({
                                option_number: opt.option_number,
                                option_name: opt.option_name.trim(),
                                votes: 0,
                            })),
                            total_votes: 0,
                            title: event.effect.pollTitle,
                            votingCommand: event.effect.pollOptions.votingCommand,
                            display: event.effect.display,
                            styles: event.effect.styles
                        },
                        position: event.effect.position,
                        customCoords: event.effect.customCoords,
                        overlayInstance: event.effect.overlayInstance || '',
                        ended: false,
                        paused: false,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        closeTime: event.effect.pollOptions.autoClose ?
                            new Date(Date.now() + (event.effect.pollOptions.duration * 1000)).toISOString() :
                            undefined,
                        displayDuration: event.effect.pollOptions.displayDuration,
                        allowMultipleVotes: event.effect.pollOptions?.allowMultipleVotes || false,
                        voters: {},
                    };

                    await votingManager.createPoll(pollId, currentPollState);
                    await votingManager.startPoll(pollId, modules.eventManager);
                }

                // Prepare data for overlay
                const data = {
                    uuid: currentPollState.uuid,
                    overlayInstance: event.effect.overlayInstance,
                    config: {
                        ...event.effect,
                        pollData: currentPollState.pollData,
                        position: event.effect.position,
                        customCoords: event.effect.customCoords
                    }
                };

                // Handle overlay instance settings
                if (settings.useOverlayInstances()) {
                    if (event.effect.overlayInstance != null) {
                        if (settings.getOverlayInstances().includes(event.effect.overlayInstance)) {
                            data.overlayInstance = event.effect.overlayInstance;
                        }
                    }
                }
                await webServer.sendToOverlay("voting-system", data);
            }
            catch (error) {
                logger.error('Voting System Error:', error);
                return { success: false };
            }
        },

        /**
         * Defines the overlay extension functionality
         * Handles how the poll is displayed in the streaming overlay
         */
        overlayExtension: {
            // External dependencies for the overlay
            dependencies: {
                css: [],
                js: []
            },

            // Event handler for the overlay
            event: {
                name: "voting-system",
                onOverlayEvent: (data: unknown) => {
                    const eventData = data as EventData;
                    const sanitizedTitle = eventData.config.pollTitle.replace(/[^a-zA-Z0-9]/g, '_');
                    const widgetId = `poll_${sanitizedTitle}`;
                    const positionClass = eventData.config.position.toLowerCase().replace(' ', '-');
                    const { customCoords } = eventData.config;

                    // Check for and update existing poll
                    let pollWrapper = document.getElementById(widgetId);
                    if (pollWrapper) {
                        // Update position class
                        pollWrapper.className = `position-wrapper ${positionClass}`;

                        // Update position styling
                        const innerPosition = pollWrapper.querySelector('.inner-position') as HTMLElement;
                        if (innerPosition) {
                            // Reset existing positioning
                            innerPosition.style.position = '';
                            innerPosition.style.top = '';
                            innerPosition.style.bottom = '';
                            innerPosition.style.left = '';
                            innerPosition.style.right = '';

                            // Apply custom coordinates if position is Custom
                            if (eventData.config.position === 'Custom' && customCoords) {
                                innerPosition.style.position = 'absolute';
                                if (customCoords.top !== null) {
                                    innerPosition.style.top = `${customCoords.top}px`;
                                }
                                if (customCoords.bottom !== null) {
                                    innerPosition.style.bottom = `${customCoords.bottom}px`;
                                }
                                if (customCoords.left !== null) {
                                    innerPosition.style.left = `${customCoords.left}px`;
                                }
                                if (customCoords.right !== null) {
                                    innerPosition.style.right = `${customCoords.right}px`;
                                }
                            }
                        }

                        // Dispatch update event for existing poll
                        const script = document.createElement('script');
                        script.textContent = `
                            window.dispatchEvent(new CustomEvent('votingSystemUpdate', {
                                detail: ${JSON.stringify(eventData)}
                            }));
                        `;
                        document.body.appendChild(script);
                        script.remove();
                        return;
                    }

                    // Create new poll overlay
                    fetch(`http://${window.location.hostname}:7472/integrations/voting-system/voting-system.html`)
                        .then(response => response.text())
                        .then(template => {
                            // Update configuration in template
                            const configString = JSON.stringify(eventData.config);
                            const updatedTemplate = template.replace(/const CONFIG = \{[\s\S]*?\};/, `const CONFIG = ${configString};`);

                            // Remove any existing polls with same ID
                            const existingPolls = document.querySelectorAll(`#${widgetId}`);
                            existingPolls.forEach(poll => poll.remove());

                            // Create wrapper element
                            const wrapper = document.createElement('div');
                            wrapper.id = widgetId;
                            wrapper.className = `position-wrapper ${positionClass}`;

                            // Create inner container with positioning
                            let innerHtml = `<div class="inner-position pollOverlay"`;

                            // Apply custom coordinates if specified
                            if (eventData.config.position === 'Custom' && customCoords) {
                                innerHtml += ` style="position: absolute;`;
                                if (customCoords.top !== null) {
                                    innerHtml += `top: ${customCoords.top}px;`;
                                }
                                if (customCoords.bottom !== null) {
                                    innerHtml += `bottom: ${customCoords.bottom}px; top: auto;`;
                                }
                                if (customCoords.left !== null) {
                                    innerHtml += `left: ${customCoords.left}px;`;
                                }
                                if (customCoords.right !== null) {
                                    innerHtml += `right: ${customCoords.right}px; left: auto;`;
                                }
                                innerHtml += `"`;
                            }
                            innerHtml += `>${updatedTemplate}</div>`;

                            wrapper.innerHTML = innerHtml;
                            $("#wrapper").append(wrapper);
                        });
                }
            }
        }
    };
    return effectType;
}