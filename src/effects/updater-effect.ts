import { Firebot } from "@crowbartools/firebot-custom-scripts-types";
import { VoteUpdateModel, PollConfig, PollOption, RemovedOption } from "../types/types";
import { votingManager } from "../utility/voting-manager";
import updaterTemplate from "../templates/updater-template.html";
import { webServer, frontendCommunicator, modules } from "../main";

/**
 * Defines and exports the main voting system effect type for Firebot
 * This is the core function that sets up the voting system functionality
 */
export function votingSystemUpdateEffectType() {
    // Define the effect type with its base configuration
    const updateEffectType: Firebot.EffectType<VoteUpdateModel> = {
        // Basic effect definition including ID, name, and UI elements
        definition: {
            id: "msgg:voting-system-update",
            name: "Advanced Poll Manager",
            description: "Add/remove options, votes, polls, pause/reset polls, and more",
            icon: "fad fa-vote-yea",
            categories: ["overlay"],
            outputs: [
                {
                    label: "Removed Options",
                    description: "A formatted list of removed options for the poll",
                    defaultName: "removedOptions"
                },
                {
                    label: "Winning Option",
                    description: "The option with the most votes",
                    defaultName: "winningOption"
                }
            ]
        },
        // Template for the options UI
        optionsTemplate: updaterTemplate,
        /**
         * Options controller setup and initialization
         * Manages the UI state and interaction logic for the voting system
         */
        optionsController: ($scope: any, backendCommunicator: any) => {
            // Define default effect settings
            const defaultEffect = {
                mode: 'manageVotes',
                action: 'add',
                pollTitle: '',
                optionNumber: 1,
                voteCount: 0,
                newOptionName: '',
                overlayInstance: '',
                // Default display settings
                display: {
                    showVoteCount: true,
                    showPercentages: true,
                    showVotingCommand: true,
                    animateProgress: true,
                    removeEmojis: {
                        fromTitle: false,
                        fromOptions: false
                    }
                },
                pollOptions: {
                    optionsList: []
                }
            };

            // Initialize scope with default values and state variables
            $scope.effect = { ...defaultEffect, ...$scope.effect };
            $scope.activePolls = [];
            $scope.endedPolls = [];
            $scope.undoTimeRemaining = 30;
            $scope.canUndoReset = false;
            $scope.displayTitle = $scope.effect.pollTitle ? $scope.effect.pollTitle.replace('poll_', '') : '';
            $scope.pollTitleData = {
                displayTitle: '',
                originalTitle: ''
            };

            // Define style labels for UI elements
            $scope.styleLabels = {
                backgroundColor: "Background Color",
                accentColor: "Accent Color",
                optionColor: "Text Color",
                titleColor: "Title Color",
                trackColor: "Bar Color",
                progressColor: "Bar Fill Color",
                shadowColor: "Text Shadow",
                progressTextColor: "Bar Text Color",
                pollScale: "Poll Scale"
            };

            // Timer for undo functionality
            let undoTimer: NodeJS.Timeout | null = null;

            /**
             * Resolves the poll ID based on the provided title
             * Handles both direct poll titles and custom variables
             * @param pollTitle - The title or variable reference for the poll
             * @param communicator - The backend communicator instance
             * @returns The resolved poll ID
             */
            function getPollId(pollTitle: string | undefined, communicator: any): string {
                if (!pollTitle) {
                    return '';
                }

                let displayTitle = pollTitle;
                // Handle custom variable references
                if (pollTitle.startsWith('$customVariable[') || pollTitle.startsWith('$$')) {
                    const variableName = pollTitle.startsWith('$$')
                        ? pollTitle.substring(2)
                        : pollTitle.replace('$customVariable[', '').replace(']', '');
                    const variableData = communicator.fireEventSync("get-custom-variable", variableName);
                    displayTitle = variableData;
                    return variableData?.startsWith('poll_') ? variableData : `poll_${variableData}`;
                }

                return displayTitle.startsWith('poll_') ? displayTitle : `poll_${displayTitle}`;
            }

            /**
             * Safely applies scope changes within Angular's digest cycle
             * Prevents "$digest already in progress" errors
             * @param fn - The function to execute within the scope
             */
            function safeApply(fn: () => void) {
                try {
                    if (!$scope.$$phase && !$scope.$root.$$phase) {
                        $scope.$apply(fn);
                    } else {
                        fn();
                    }
                } catch (error) {
                    console.error("[VotingSystemUpdater] Error in safeApply:", error);
                }
            }
            /**
             * Loads poll options and settings from the backend
             * Updates the UI with current poll data
             */
            $scope.loadPollOptions = () => {
                let pollId = $scope.effect.pollSelectionMode === 'manual'
                    ? getPollId($scope.effect.manualPollTitle, backendCommunicator)
                    : ($scope.effect.pollTitle || '');

                if (!pollId) {
                    safeApply(() => {
                        $scope.effect.pollOptions.optionsList = [];
                    });
                    return;
                }

                // Fetch and process poll data
                backendCommunicator.fireEventAsync("getPollData", pollId)
                    .then((pollData: any) => {
                        if (pollData && pollData.pollData) {
                            safeApply(() => {
                                // Update UI with poll data
                                $scope.effect.pollOptions.optionsList = pollData.pollData.options;
                                $scope.pollTitleData.displayTitle = pollData.pollData.title;
                                $scope.pollTitleData.originalTitle = pollData.pollData.title;
                                $scope.effect.pollOptions.allowMultipleVotes = pollData.allowMultipleVotes ?? false;

                                // Update display settings
                                $scope.effect.display = {
                                    showVoteCount: pollData.pollData.display?.showVoteCount ?? true,
                                    showPercentages: pollData.pollData.display?.showPercentages ?? true,
                                    showVotingCommand: pollData.pollData.display?.showVotingCommand ?? true,
                                    animateProgress: pollData.pollData.display?.animateProgress ?? true,
                                    removeEmojis: {
                                        fromTitle: pollData.pollData.display?.removeEmojis?.fromTitle ?? false,
                                        fromOptions: pollData.pollData.display?.removeEmojis?.fromOptions ?? false
                                    }
                                };

                                // Update styles if present
                                if (pollData.pollData.styles) {
                                    $scope.effect.styles = { ...pollData.pollData.styles };
                                }
                            });
                        }
                    });
            };

            /**
             * Loads removed options for a poll
             * Updates the UI with the list of removed options
             */
            $scope.loadRemovedOptions = () => {
                let pollId: string = $scope.effect.pollSelectionMode === 'manual'
                    ? getPollId($scope.effect.manualPollTitle, backendCommunicator)
                    : $scope.effect.pollTitle;

                if (!pollId) return;

                backendCommunicator.fireEventAsync("getRemovedOptions", pollId)
                    .then((removedOptions: Record<string, RemovedOption>) => {
                        safeApply(() => {
                            if (removedOptions && typeof removedOptions === 'object') {
                                $scope.removedOptions = Object.values(removedOptions);
                            } else {
                                $scope.removedOptions = [];
                            }
                        });
                    })
                    .catch((error: Error) => {
                        console.error('Error loading removed options:', error);
                        $scope.removedOptions = [];
                    });
            };

            /**
             * Restores a removed option by its value (number or name)
             * @param value - The option number or name to restore
             */
            $scope.restoreByValue = (value: string) => {
                if (!value) return;

                let pollId: string = $scope.effect.pollSelectionMode === 'manual'
                    ? getPollId($scope.effect.manualPollTitle, backendCommunicator)
                    : $scope.effect.pollTitle;

                // Find option by number or name
                const matchingOption = $scope.removedOptions.find((opt: RemovedOption) =>
                    opt.formerNumber.toString() === value ||
                    opt.option_name.toLowerCase() === value.toLowerCase()
                );

                if (matchingOption) {
                    backendCommunicator.fireEventAsync("restoreOption", {
                        pollId: pollId,
                        optionNumber: matchingOption.option_number
                    })
                        .then(() => {
                            $scope.effect.restoreValue = ''; // Clear the input
                            $scope.loadPollOptions();
                            $scope.loadRemovedOptions();
                        })
                        .catch((error: Error) => {
                            console.error('Error restoring option:', error);
                        });
                }
            };
            /**
             * Adds a new option to the poll
             * Creates a new option with the next available number
             */
            $scope.addOption = () => {
                let pollId: string = getPollId($scope.effect.manualPollTitle, backendCommunicator);

                // Find the highest option number and increment by 1
                const maxOptionNumber = Math.max(
                    ...($scope.effect.pollOptions.optionsList.map((opt: { option_number: number }) => opt.option_number)),
                    0
                );

                // Create new option object
                const newOption = {
                    option_number: maxOptionNumber + 1,
                    option_name: "",
                    votes: 0,
                    pendingCreation: $scope.effect.pollSelectionMode === 'pollList'
                };

                $scope.effect.pollOptions.optionsList.push(newOption);

                // Update backend if in manual mode
                if ($scope.effect.pollSelectionMode === 'manual') {
                    backendCommunicator.fireEventAsync("updatePollOptions", {
                        pollId: pollId,
                        options: $scope.effect.pollOptions.optionsList
                    }).then(() => {
                        $scope.loadPollOptions();
                    });
                }
            };

            /**
             * Confirms a new option name
             * Sends the update to the backend and refreshes the UI
             * @param index - The index of the option in the options list
             */
            $scope.confirmOptionName = (index: number) => {
                let pollId: string = $scope.effect.pollSelectionMode === 'manual'
                    ? getPollId($scope.effect.manualPollTitle, backendCommunicator)
                    : $scope.effect.pollTitle;

                const option = $scope.effect.pollOptions.optionsList[index];

                const updatedOptions = $scope.effect.pollOptions.optionsList.map((opt: PollOption, i: number) => {
                    if (i === index) {
                        return {
                            ...opt,
                            pendingCreation: false,
                            option_name: opt.option_name.trim()
                        };
                    }
                    return opt;
                });

                backendCommunicator.fireEventAsync("updatePollOptions", {
                    pollId: pollId,
                    options: updatedOptions
                }).then(() => {
                    safeApply(() => {
                        option.pendingCreation = false;
                        option.originalName = option.option_name;
                    });
                    $scope.loadPollOptions();
                }).catch((error: Error) => {
                    console.error('Error confirming new option:', error);
                    safeApply(() => {
                        $scope.effect.pollOptions.optionsList =
                            $scope.effect.pollOptions.optionsList.filter((_: PollOption, i: number) => i !== index);
                    });
                });
            };

            /**
             * Handles option name changes for existing options
             * Updates both the option and any related removed options
             * @param index - The index of the option being renamed
             */
            $scope.confirmOptionNameChange = (index: number) => {
                let pollId: string = $scope.effect.pollSelectionMode === 'manual'
                    ? getPollId($scope.effect.manualPollTitle, backendCommunicator)
                    : $scope.effect.pollTitle;

                const option = $scope.effect.pollOptions.optionsList[index];
                const oldName = option.originalName;

                const updatedOptions = $scope.effect.pollOptions.optionsList.map((opt: PollOption, i: number) => {
                    if (i === index) {
                        return {
                            ...opt,
                            option_name: option.option_name.trim()
                        };
                    }
                    return opt;
                });

                // Update the option in the poll
                backendCommunicator.fireEventAsync("updatePollOptions", {
                    pollId: pollId,
                    options: updatedOptions
                }).then(() => {
                    // Update any matching removed options with the new name
                    let promises = [];

                    if ($scope.removedOptions) {
                        promises = $scope.removedOptions
                            .filter((removedOption: RemovedOption) => removedOption.option_name === oldName)
                            .map((removedOption: RemovedOption) =>
                                backendCommunicator.fireEventAsync("updateRemovedOptionName", {
                                    pollId: pollId,
                                    optionNumber: removedOption.formerNumber,
                                    newName: option.option_name
                                })
                            );
                    }

                    return Promise.all(promises);
                }).then(() => {
                    safeApply(() => {
                        option.originalName = option.option_name;
                        option.nameChanged = false;
                    });
                    $scope.loadPollOptions();
                    $scope.loadRemovedOptions();
                }).catch((error: Error) => {
                    console.error('Error updating option name:', error);
                    safeApply(() => {
                        option.option_name = option.originalName;
                        option.nameChanged = false;
                    });
                });
            };

            /**
             * Updates the poll title and handles related UI updates
             * Ensures proper sanitization of the title for use as an ID
             */
            $scope.confirmPollTitleChange = () => {
                if (!$scope.effect.pollTitle || !$scope.pollTitleData.displayTitle) {
                    console.error('Missing required poll information');
                    return;
                }

                const oldPollId = $scope.effect.pollTitle;
                const displayTitle = $scope.pollTitleData.displayTitle.trim();
                const sanitizedTitle = displayTitle.replace(/[^a-zA-Z0-9]/g, '_');
                const newPollId = `poll_${sanitizedTitle}`;

                if (oldPollId === newPollId) {
                    console.log('Poll names are identical, no change needed');
                    return;
                }

                // Update the poll title in the backend
                backendCommunicator.fireEventAsync("updatePollTitle", {
                    oldPollId: oldPollId,
                    newPollId: newPollId,
                    displayTitle: displayTitle
                }).then(() => {
                    safeApply(() => {
                        $scope.effect.pollTitle = newPollId;
                        $scope.pollTitleData.originalTitle = $scope.pollTitleData.displayTitle;
                        $scope.titleChanged = false;
                    });
                    setTimeout(() => {
                        loadPolls();
                        loadEndedPolls();
                        $scope.loadPollOptions();
                    }, 100);
                }).catch((error: Error | unknown) => {
                    console.error('Error updating poll title:', error);
                    safeApply(() => {
                        $scope.pollTitleData.displayTitle = $scope.pollTitleData.originalTitle;
                        $scope.titleChanged = false;
                    });
                });
            };
            /**
             * Removes an option from the poll
             * If the option is pending creation, removes it locally
             * Otherwise, stores it as a removed option in the backend
             * @param index - The index of the option to remove
             */
            $scope.removeOption = (index: number) => {
                const option = $scope.effect.pollOptions.optionsList[index];

                // Handle pending options that haven't been saved yet
                if (option.pendingCreation) {
                    $scope.effect.pollOptions.optionsList.splice(index, 1);
                    return;
                }

                let pollId: string = $scope.effect.pollSelectionMode === 'manual'
                    ? getPollId($scope.effect.manualPollTitle, backendCommunicator)
                    : $scope.effect.pollTitle;

                // Store the removed option in the backend
                backendCommunicator.fireEventAsync("storeRemovedOption", {
                    pollId: pollId,
                    option: option
                }).then(() => {
                    // Refresh the displays after the operation is complete
                    $scope.loadPollOptions();
                    $scope.loadRemovedOptions();
                });
            };

            /**
             * Restores a previously removed option
             * @param option - The removed option to restore
             */
            $scope.restoreOption = (option: RemovedOption) => {
                let pollId: string = $scope.effect.pollSelectionMode === 'manual'
                    ? getPollId($scope.effect.manualPollTitle, backendCommunicator)
                    : $scope.effect.pollTitle;

                backendCommunicator.fireEventAsync("restoreOption", {
                    pollId: pollId,
                    optionNumber: option.formerNumber
                })
                    .then(() => {
                        $scope.loadPollOptions();
                        $scope.loadRemovedOptions();
                    })
                    .catch((error: Error) => {
                        console.error('Error restoring option:', error);
                    });
            };

            /**
             * Updates the UI with removed options data
             * @param removedOptions - Array of removed options to display
             */
            $scope.processRemovedOption = (removedOptions: RemovedOption[]): void => {
                safeApply(() => {
                    $scope.removedOptions = removedOptions;
                });
            };

            /**
             * Handles undoing a poll reset
             * Only available for a short time after reset
             */
            $scope.undoResetPoll = () => {
                let pollId = $scope.effect.pollTitle;
                backendCommunicator.fireEventAsync("undoResetPoll", {
                    pollId: pollId
                }).then(() => {
                    $scope.canUndoReset = false;
                    $scope.loadPollOptions();
                    frontendCommunicator.send("pollDataChanged", pollId);
                });
            };
            /**
             * Watcher for effect mode changes
             * Handles UI updates and data loading based on mode changes
             */
            $scope.$watch('effect.mode', async (newMode: string) => {
                if (!newMode) return;

                const pollId = $scope.effect.pollSelectionMode === 'manual'
                    ? getPollId($scope.effect.manualPollTitle, backendCommunicator)
                    : $scope.effect.pollTitle;

                switch (newMode) {
                    case 'updateStyles':
                    case 'updateDisplay':
                        // Initialize settings if not present
                        if (!$scope.effect.setting?.type) {
                            $scope.effect.setting = {
                                type: newMode === 'updateStyles' ? 'backgroundColor' : 'allowMultipleVotes',
                                value: newMode === 'updateStyles' ? '' : false
                            };
                        }
                        // Load display settings for updateDisplay mode
                        if (newMode === 'updateDisplay' && pollId) {
                            const data = await backendCommunicator.fireEventAsync("getPollData", pollId);
                            if (data?.pollData?.display) {
                                safeApply(() => {
                                    $scope.effect.display = { ...data.pollData.display };
                                });
                            }
                        }
                        break;

                    case 'updateOverlayInstance':
                        // Load overlay instance data if available
                        if (pollId) {
                            const pollData = await backendCommunicator.fireEventAsync("getPollData", pollId);
                            if (pollData) {
                                safeApply(() => {
                                    $scope.effect.overlayInstance = pollData.overlayInstance || '';
                                });
                            }
                        }
                        break;

                    case 'removePoll':
                    case 'undoReset':
                        // Reset various UI elements
                        $scope.effect.action = null;
                        $scope.effect.optionNumber = null;
                        $scope.showVoteOptions = false;
                        $scope.showUpdateOptions = false;
                        break;

                    case 'updateOptions':
                        $scope.loadRemovedOptions();
                        break;
                }
            });

            /**
             * Watcher for poll selection and title changes
             * Triggers reloading of poll data when selection changes
             */
            $scope.$watch('[effect.pollSelectionMode, effect.manualPollTitle, effect.pollTitle]',
                (newVal: [string, string, string], oldVal: [string, string, string]) => {
                    const [newMode, newManual, newTitle] = newVal;
                    const [oldMode, oldManual, oldTitle] = oldVal;

                    if (newMode !== oldMode || newManual !== oldManual || newTitle !== oldTitle) {
                        $scope.loadPollOptions();
                        $scope.loadRemovedOptions();

                        if (newTitle && $scope.effect.mode === 'updateOptions') {
                            $scope.loadRemovedOptions();
                        }
                    }
                }, true);

            // Event handler registrations for poll updates
            backendCommunicator.on("pollRemoved", () => {
                loadPolls();
                loadEndedPolls();
            });

            backendCommunicator.on("pollEnded", () => {
                loadPolls();
                loadEndedPolls();
            });

            backendCommunicator.on("pollStarted", () => {
                loadPolls();
                loadEndedPolls();
            });

            /**
             * Handles poll reset events
             * Sets up undo functionality with a timer
             */
            backendCommunicator.on("pollReset", (pollId: string) => {
                if (pollId === $scope.effect.pollTitle) {
                    if (undoTimer) {
                        clearInterval(undoTimer);
                    }

                    $scope.canUndoReset = true;
                    $scope.undoTimeRemaining = 30;

                    undoTimer = setInterval(() => {
                        safeApply(() => {
                            $scope.undoTimeRemaining--;
                            if ($scope.undoTimeRemaining <= 0) {
                                $scope.canUndoReset = false;
                                clearInterval(undoTimer!);
                                undoTimer = null;
                            }
                        });
                    }, 1000);
                }
            });

            /**
             * Handles poll data change events
             * Reloads poll options when data changes
             */
            backendCommunicator.on("pollDataChanged", (updatedPollId: string) => {
                if (updatedPollId === $scope.effect.pollTitle ||
                    (updatedPollId === $scope.effect.manualPollTitle?.replace(/^poll_/, ''))) {
                    $scope.loadPollOptions();
                }
            });
            /**
             * Processes the response from getting active polls
             * Maps poll data to the format needed for the UI
             * @param response - Array of poll IDs
             */
            function handleResponse(response: unknown) {
                if (Array.isArray(response) && response.every(item => typeof item === 'string')) {
                    backendCommunicator.fireEventAsync("getAllPollsWithStatus", {})
                        .then((pollsWithStatus: Array<{ pollId: string, displayTitle: string, status: 'active' | 'stopped' }>) => {
                            const mappedPolls = response.map(pollId => {
                                const pollInfo = pollsWithStatus.find((p: { pollId: string, displayTitle: string }) => p.pollId === pollId);
                                return {
                                    value: pollId,
                                    label: pollInfo ? pollInfo.displayTitle : pollId.replace('poll_', '')
                                };
                            });

                            safeApply(() => {
                                $scope.activePolls = mappedPolls;
                                if ($scope.effect.pollTitle) {
                                    $scope.loadPollOptions();
                                }
                            });
                        });
                }
            }

            /**
             * Processes the response for ended polls
             * Maps poll data including status information
             * @param response - Array of poll data including status
             */
            function handleEndedPollsResponse(response: Array<{ pollId: string, displayTitle: string, status: 'active' | 'stopped' }>) {
                if (Array.isArray(response)) {
                    const mappedPolls = response.map(poll => ({
                        value: poll.pollId,
                        label: `${poll.displayTitle} (${poll.status})`
                    }));

                    safeApply(() => {
                        $scope.endedPolls = mappedPolls;
                        if ($scope.effect.pollTitle) {
                            $scope.loadPollOptions();
                        }
                    });
                }
            }

            /**
             * Loads active polls from the backend
             * Updates the UI with the current list of active polls
             */
            function loadPolls() {
                backendCommunicator.fireEventAsync("getActivePolls", {})
                    .then((response: unknown) => {
                        handleResponse(response);
                    })
                    .catch((error: unknown) => {
                        console.error("[VotingSystemUpdater] Error:", error);
                    });
            }

            /**
             * Loads all polls with their current status
             * Updates the UI with both active and ended polls
             */
            function loadEndedPolls() {
                backendCommunicator.fireEventAsync("getAllPollsWithStatus", {})
                    .then((response: unknown) => {
                        handleEndedPollsResponse(response as Array<{
                            pollId: string,
                            displayTitle: string,
                            status: 'active' | 'stopped'
                        }>);
                    })
                    .catch((error: unknown) => {
                        console.error("[VotingSystemUpdater] Error loading polls:", error);
                    });
            }

            // Initial load of polls
            loadPolls();
            loadEndedPolls();

            // Cleanup on controller destruction
            $scope.$on('$destroy', () => {
                console.log("[VotingSystemUpdater] Cleaning up controller");
                if (undoTimer) {
                    clearInterval(undoTimer);
                }
            });
        },
        /**
         * Handles triggered events for the voting system
         * Processes various actions like updating polls, managing votes, etc.
         * @param event - The triggered event containing effect details
         */
        onTriggerEvent: async (event) => {
            /**
             * Resolves poll ID from various sources
             * Handles both manual and automatic poll selection
             */
            async function getAsyncPollId(
                pollSelectionMode: string,
                manualPollTitle: string | undefined,
                defaultPollTitle: string
            ): Promise<string> {
                if (pollSelectionMode === 'manual') {
                    if (manualPollTitle) {
                        if (manualPollTitle.startsWith('$customVariable[') || manualPollTitle.startsWith('$$')) {
                            const variableName = manualPollTitle.startsWith('$$')
                                ? manualPollTitle.substring(2)
                                : manualPollTitle.replace('$customVariable[', '').replace(']', '');
                            const variableData = await frontendCommunicator.fireEventAsync("get-custom-variable", variableName) as string;
                            return typeof variableData === 'string' && variableData.startsWith('poll_')
                                ? variableData
                                : `poll_${variableData}`;
                        }
                        return manualPollTitle.startsWith('poll_')
                            ? manualPollTitle
                            : `poll_${manualPollTitle.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    }
                    // Handle automatic poll selection
                    const activePolls = await votingManager.getActivePolls();
                    if (activePolls.length === 1) return activePolls[0];
                    if (activePolls.length === 0) throw new Error('No active polls found');
                    const endedPolls = await votingManager.getEndedPolls();
                    if (endedPolls.length === 1) return endedPolls[0];
                    if (endedPolls.length === 0) throw new Error('No active polls found');
                    throw new Error('Multiple polls active - please specify target poll');
                }
                return defaultPollTitle;
            }

            try {
                let pollId: string;

                // Determine the poll ID based on selection mode
                if (event.effect.pollSelectionMode === 'manual') {
                    if (event.effect.manualPollTitle) {
                        pollId = event.effect.manualPollTitle.startsWith('poll_')
                            ? event.effect.manualPollTitle
                            : `poll_${event.effect.manualPollTitle.replace(/[^a-zA-Z0-9]/g, '_')}`;
                    } else {
                        const activePolls = await votingManager.getActivePolls();
                        if (activePolls.length === 1) {
                            pollId = activePolls[0];
                        } else if (activePolls.length === 0) {
                            throw new Error('No active polls found');
                        } else {
                            throw new Error('Multiple polls active - please specify target poll');
                        }
                    }
                } else {
                    pollId = event.effect.pollTitle;
                }

                const pollData = await votingManager.getPoll(pollId);
                if (!pollData) {
                    throw new Error(`Poll ${pollId} not found`);
                }

                // Handle different modes using voting-updater
                switch (event.effect.mode) {

                    case 'updatePosition': {
                        // Get current poll data first
                        const updatedPoll = await votingManager.getPoll(pollId);
                        if (!updatedPoll) {
                            throw new Error('Poll not found');
                        }

                        // Handle the position update if provided
                        if (event.effect.position) {
                            let newPosition = event.effect.position;

                            // Handle random position selection
                            if (newPosition === 'Random') {
                                const presetPositions = [
                                    'Top Left',
                                    'Top Middle',
                                    'Top Right',
                                    'Middle Left',
                                    'Middle',
                                    'Middle Right',
                                    'Bottom Left',
                                    'Bottom Middle',
                                    'Bottom Right'
                                ];
                                const randomIndex = Math.floor(Math.random() * presetPositions.length);
                                newPosition = presetPositions[randomIndex];
                            }

                            updatedPoll.position = newPosition;
                        }

                        // Update custom coordinates if provided
                        if (event.effect.customCoords) {
                            updatedPoll.customCoords = event.effect.customCoords;
                        }

                        // Save the updated poll configuration
                        await votingManager.updatePoll(pollId, updatedPoll);

                        // Send update to overlay using a standardized format
                        await webServer.sendToOverlay("voting-updater", {
                            type: 'update',
                            overlayInstance: updatedPoll.overlayInstance,
                            config: {
                                pollTitle: pollId.replace('poll_', ''),
                                pollData: updatedPoll.pollData,
                                styles: updatedPoll.pollData.styles,
                                display: updatedPoll.pollData.display,
                                pollOptions: {
                                    votingCommand: updatedPoll.pollData.votingCommand
                                },
                                uuid: updatedPoll.uuid,
                                position: updatedPoll.position,
                                customCoords: updatedPoll.customCoords,
                                ended: updatedPoll.ended,
                                paused: updatedPoll.paused
                            }
                        });

                        // Notify frontend to reload poll data
                        frontendCommunicator.send('pollDataChanged', pollId);
                        break;
                    }

                    case 'updateStyles': {
                        const pollData = await votingManager.getPoll(pollId);
                        if (!pollData) throw new Error('Poll not found');

                        // Define default style settings
                        const defaultStyles = {
                            backgroundColor: "#111111",
                            accentColor: "#a60000",
                            optionColor: "#e3e3e3",
                            titleColor: "#e3e3e3",
                            trackColor: "#e9e9e9",
                            progressColor: "#a60000",
                            shadowColor: "#a60000",
                            progressTextColor: "#000000",
                            pollScale: 1
                        };

                        // Handle individual style updates in manual mode
                        if (event.effect.pollSelectionMode === 'manual' && event.effect.setting) {
                            // Update specific style property based on setting type
                            switch (event.effect.setting.type) {
                                case 'backgroundColor':
                                    pollData.pollData.styles.backgroundColor = String(event.effect.setting.value);
                                    break;
                                case 'accentColor':
                                    pollData.pollData.styles.accentColor = String(event.effect.setting.value);
                                    break;
                                case 'optionColor':
                                    pollData.pollData.styles.optionColor = String(event.effect.setting.value);
                                    break;
                                case 'titleColor':
                                    pollData.pollData.styles.titleColor = String(event.effect.setting.value);
                                    break;
                                case 'trackColor':
                                    pollData.pollData.styles.trackColor = String(event.effect.setting.value);
                                    break;
                                case 'progressColor':
                                    pollData.pollData.styles.progressColor = String(event.effect.setting.value);
                                    break;
                                case 'shadowColor':
                                    pollData.pollData.styles.shadowColor = String(event.effect.setting.value);
                                    break;
                                case 'progressTextColor':
                                    pollData.pollData.styles.progressTextColor = String(event.effect.setting.value);
                                    break;
                                case 'pollScale':
                                    pollData.pollData.styles.pollScale = Number(event.effect.setting.value) || defaultStyles.pollScale;
                                    break;
                            }
                        } else {
                            // Handle bulk style updates in list mode
                            pollData.pollData.styles = {
                                ...pollData.pollData.styles,
                                backgroundColor: event.effect.styles?.backgroundColor ?? defaultStyles.backgroundColor,
                                accentColor: event.effect.styles?.accentColor ?? defaultStyles.accentColor,
                                optionColor: event.effect.styles?.optionColor ?? defaultStyles.optionColor,
                                titleColor: event.effect.styles?.titleColor ?? defaultStyles.titleColor,
                                trackColor: event.effect.styles?.trackColor ?? defaultStyles.trackColor,
                                progressColor: event.effect.styles?.progressColor ?? defaultStyles.progressColor,
                                shadowColor: event.effect.styles?.shadowColor ?? defaultStyles.shadowColor,
                                progressTextColor: event.effect.styles?.progressTextColor ?? defaultStyles.progressTextColor,
                                pollScale: event.effect.styles?.pollScale ?? defaultStyles.pollScale
                            };
                        }

                        // Save updated poll data
                        await votingManager.updatePoll(pollId, pollData);

                        // Send updates to overlay
                        await webServer.sendToOverlay("voting-updater", {
                            type: 'update',
                            overlayInstance: pollData.overlayInstance,
                            config: {
                                pollTitle: pollId.replace('poll_', ''),
                                pollData: pollData.pollData,
                                styles: pollData.pollData.styles,
                                display: pollData.pollData.display,
                                pollOptions: {
                                    votingCommand: pollData.pollData.votingCommand
                                },
                                position: pollData.position,
                                customCoords: pollData.customCoords,
                                paused: pollData.paused,
                                ended: pollData.ended
                            }
                        });
                        break;
                    }
                    case 'togglePauseState': {
                        // Update poll pause state based on action
                        const updatedPoll = event.effect.pauseAction === 'pause'
                            ? await votingManager.pausePoll(pollId)
                            : await votingManager.unpausePoll(pollId);

                        if (updatedPoll) {
                            // Send update to overlay with new pause state
                            await webServer.sendToOverlay("voting-updater", {
                                type: 'update',
                                overlayInstance: updatedPoll.overlayInstance,
                                config: {
                                    pollTitle: pollId.replace('poll_', ''),
                                    pollData: updatedPoll.pollData,
                                    paused: updatedPoll.paused,
                                    position: updatedPoll.position,
                                    customCoords: updatedPoll.customCoords
                                }
                            });

                            frontendCommunicator.send("pollPauseToggled", pollId);
                        }
                        break;
                    }

                    case 'pollStatus': {
                        // Handle poll start/stop actions
                        if (event.effect.pollStatus === 'stop') {
                            await votingManager.stopPoll(pollId, 'manual', modules.eventManager);
                        } else {
                            await votingManager.startPoll(pollId, modules.eventManager);
                        }

                        // Get updated poll data after state change
                        const updatedPoll = await votingManager.getPoll(pollId);
                        if (!updatedPoll) {
                            throw new Error('Failed to get updated poll data');
                        }

                        // Update overlay with new poll state
                        await webServer.sendToOverlay("voting-updater", {
                            type: 'update',
                            overlayInstance: updatedPoll.overlayInstance,
                            config: {
                                pollTitle: pollId.replace('poll_', ''),
                                pollData: updatedPoll.pollData,
                                styles: updatedPoll.pollData.styles,
                                display: updatedPoll.pollData.display,
                                pollOptions: {
                                    votingCommand: updatedPoll.pollData.votingCommand
                                },
                                ended: updatedPoll.ended,
                                position: updatedPoll.position,
                                customCoords: updatedPoll.customCoords
                            }
                        });

                        // Emit appropriate event based on action
                        if (event.effect.pollStatus === 'stop') {
                            frontendCommunicator.send("pollEnded", pollId);
                        } else {
                            frontendCommunicator.send("pollStarted", pollId);
                        }

                        break;
                    }

                    case 'resetPoll': {
                        // Reset the poll with undo capability
                        await votingManager.resetPollWithUndo(pollId);
                        const updatedPoll = await votingManager.getPoll(pollId);

                        // Update overlay with reset state
                        await webServer.sendToOverlay("voting-updater", {
                            type: 'update',
                            overlayInstance: updatedPoll?.overlayInstance,
                            config: {
                                pollTitle: pollId.replace('poll_', ''),
                                pollData: updatedPoll?.pollData,
                                styles: updatedPoll?.pollData.styles,
                                display: updatedPoll?.pollData.display,
                                pollOptions: {
                                    votingCommand: updatedPoll?.pollData.votingCommand
                                },
                                position: updatedPoll?.position,
                                customCoords: updatedPoll?.customCoords,
                                isResetting: true
                            }
                        });

                        frontendCommunicator.send("pollReset", pollId);
                        break;
                    }
                    case 'updateOverlayInstance': {
                        const poll = await votingManager.getPoll(pollId);
                        if (!poll) {
                            throw new Error('Poll not found');
                        }

                        // Store old instance for cleanup
                        const oldInstance = poll.overlayInstance;

                        // Update to new overlay instance
                        poll.overlayInstance = event.effect.overlayInstance || '';
                        await votingManager.updatePoll(pollId, poll);

                        // Remove poll from old instance
                        await webServer.sendToOverlay("voting-updater", {
                            type: 'remove',
                            overlayInstance: oldInstance,
                            config: {
                                pollTitle: pollId.replace('poll_', '')
                            }
                        });

                        // Show poll in new instance
                        await webServer.sendToOverlay("voting-updater", {
                            type: 'show',
                            overlayInstance: event.effect.overlayInstance,
                            config: {
                                pollTitle: pollId.replace('poll_', ''),
                                pollData: poll.pollData,
                                styles: poll.pollData.styles,
                                display: poll.pollData.display,
                                pollOptions: {
                                    votingCommand: poll.pollData.votingCommand
                                },
                                position: poll.position,
                                customCoords: poll.customCoords,
                                ended: poll.ended,
                                paused: poll.paused
                            }
                        });

                        break;
                    }

                    case 'undoReset': {
                        // Attempt to undo the last reset
                        const success = await votingManager.undoReset(pollId);
                        if (!success) {
                            throw new Error('No reset to undo or undo window expired');
                        }

                        // Update overlay with restored data
                        const updatedPoll = await votingManager.getPoll(pollId);
                        await webServer.sendToOverlay("voting-updater", {
                            type: 'update',
                            overlayInstance: updatedPoll?.overlayInstance,
                            config: {
                                pollTitle: pollId.replace('poll_', ''),
                                pollData: updatedPoll?.pollData,
                                styles: updatedPoll?.pollData.styles,
                                display: updatedPoll?.pollData.display,
                                pollOptions: {
                                    votingCommand: updatedPoll?.pollData.votingCommand
                                },
                                position: updatedPoll?.position,
                                customCoords: updatedPoll?.customCoords
                            }
                        });

                        frontendCommunicator.send("pollReset", pollId);
                        break;
                    }

                    case 'removePoll': {
                        // Backup poll before removal
                        const poll = await votingManager.getPoll(pollId);
                        await votingManager.backupPoll(pollId);

                        // Remove from overlay
                        await webServer.sendToOverlay("voting-updater", {
                            type: 'remove',
                            overlayInstance: poll?.overlayInstance || '',
                            config: {
                                pollTitle: pollId.replace('poll_', '')
                            }
                        });

                        frontendCommunicator.send("pollRemoved", pollId);
                        break;
                    }

                    case 'toggleVisibility': {
                        const poll = await votingManager.getPoll(pollId);
                        // Handle hide action
                        if (event.effect.visibilityAction === 'hide') {
                            await webServer.sendToOverlay("voting-updater", {
                                type: 'hide',
                                overlayInstance: poll?.overlayInstance,
                                config: {
                                    pollTitle: pollId.replace('poll_', '')
                                }
                            });
                        } else {
                            // Handle show action with full poll data
                            const poll = await votingManager.getPoll(pollId);
                            await webServer.sendToOverlay("voting-updater", {
                                type: 'show',
                                overlayInstance: poll?.overlayInstance,
                                config: {
                                    pollTitle: pollId.replace('poll_', ''),
                                    pollData: poll?.pollData,
                                    styles: poll?.pollData.styles,
                                    display: poll?.pollData.display,
                                    pollOptions: {
                                        votingCommand: poll?.pollData.votingCommand
                                    },
                                    paused: poll?.paused,
                                    position: poll?.position,
                                    customCoords: poll?.customCoords,
                                    show: true
                                }
                            });
                        }
                        break;
                    }

                    case 'updateDisplay': {
                        const pollData = await votingManager.getPoll(pollId);
                        if (!pollData) throw new Error('Poll not found');

                        // Handle individual setting updates in manual mode
                        if (event.effect.pollSelectionMode === 'manual' && event.effect.setting) {
                            switch (event.effect.setting.type) {
                                case 'allowMultipleVotes':
                                    pollData.allowMultipleVotes = event.effect.setting.value;
                                    break;
                                case 'showVoteCount':
                                    pollData.pollData.display.showVoteCount = event.effect.setting.value;
                                    break;
                                case 'showPercentages':
                                    pollData.pollData.display.showPercentages = event.effect.setting.value;
                                    break;
                                case 'showVotingCommand':
                                    pollData.pollData.display.showVotingCommand = event.effect.setting.value;
                                    break;
                                case 'animateProgress':
                                    pollData.pollData.display.animateProgress = event.effect.setting.value;
                                    break;
                                case 'removeEmojisFromTitle':
                                    pollData.pollData.display.removeEmojis.fromTitle = event.effect.setting.value;
                                    break;
                                case 'removeEmojisFromOptions':
                                    pollData.pollData.display.removeEmojis.fromOptions = event.effect.setting.value;
                                    break;
                                case 'votingCommand':
                                    pollData.pollData.votingCommand = event.effect.setting.value;
                                    break;
                            }
                        } else {
                            // Handle bulk display updates in list mode
                            pollData.pollData.display = {
                                ...pollData.pollData.display,
                                showVoteCount: event.effect.display?.showVoteCount ?? true,
                                showPercentages: event.effect.display?.showPercentages ?? true,
                                showVotingCommand: event.effect.display?.showVotingCommand ?? true,
                                animateProgress: event.effect.display?.animateProgress ?? true,
                                removeEmojis: {
                                    fromTitle: event.effect.display?.removeEmojis?.fromTitle ?? false,
                                    fromOptions: event.effect.display?.removeEmojis?.fromOptions ?? false
                                }
                            };
                            pollData.pollData.votingCommand = event.effect.pollOptions?.votingCommand ?? "!vote";
                            pollData.allowMultipleVotes = event.effect.pollOptions?.allowMultipleVotes ?? false;
                        }

                        // Save updated poll data
                        await votingManager.updatePoll(pollId, pollData);

                        // Send update to overlay
                        await webServer.sendToOverlay("voting-updater", {
                            type: 'update',
                            overlayInstance: pollData.overlayInstance,
                            config: {
                                pollTitle: pollId.replace('poll_', ''),
                                pollData: pollData.pollData,
                                styles: pollData.pollData.styles,
                                display: pollData.pollData.display,
                                pollOptions: {
                                    votingCommand: pollData.pollData.votingCommand,
                                    allowMultipleVotes: pollData.allowMultipleVotes
                                },
                                position: pollData.position,
                                customCoords: pollData.customCoords
                            }
                        });
                        break;
                    }
                    case 'updateOptions': {
                        if (event.effect.pollSelectionMode === 'manual') {
                            if (event.effect.action === 'remove') {
                                // Handle option removal by number or name
                                const identifier = event.effect.optionNumber;
                                const option = pollData.pollData.options.find(opt =>
                                    opt.option_number === Number(identifier) ||
                                    opt.option_name.toLowerCase() === String(identifier).toLowerCase()
                                );
                                if (option) {
                                    await votingManager.storeRemovedOption(pollId, option);
                                }
                            } else if (event.effect.action === 'add') {
                                // Add new option
                                await votingManager.addOption(pollId, String(event.effect.optionNumber));
                            } else if (event.effect.action === 'restore') {
                                // Restore previously removed option
                                const identifier = event.effect.optionNumber;
                                const removedOptions = await votingManager.getRemovedOptions(pollId);
                                const optionToRestore = Object.values(removedOptions).find(opt =>
                                    opt.formerNumber === Number(identifier) ||
                                    opt.option_name.toLowerCase() === String(identifier).toLowerCase()
                                );
                                if (optionToRestore) {
                                    await votingManager.restoreOption(pollId, optionToRestore.formerNumber);
                                }
                            } else if (event.effect.action === 'rename') {
                                // Rename existing option
                                const identifier = event.effect.optionNumber;
                                const newName = String(event.effect.newName);
                                const option = pollData.pollData.options.find(opt =>
                                    opt.option_number === Number(identifier) ||
                                    opt.option_name.toLowerCase() === String(identifier).toLowerCase()
                                );

                                if (option) {
                                    const oldName = option.option_name;
                                    option.option_name = newName;
                                    await votingManager.updateOptions(pollId, pollData.pollData.options);

                                    // Update removed options with new name if necessary
                                    const removedOptions = await votingManager.getRemovedOptions(pollId);
                                    Object.values(removedOptions).forEach((removedOption: RemovedOption) => {
                                        if (removedOption.option_name === oldName) {
                                            votingManager.updateRemovedOptionName(pollId, removedOption.formerNumber, newName);
                                        }
                                    });
                                }
                            } else if (event.effect.action === 'renamePoll') {
                                // Rename the entire poll
                                const sanitizedTitle = event.effect.newPollTitle.replace(/[^a-zA-Z0-9]/g, '_');
                                const newPollId = `poll_${sanitizedTitle}`;

                                // Remove old poll from overlay
                                const currentPoll = await votingManager.getPoll(pollId);
                                if (!currentPoll) {
                                    throw new Error('Current poll not found');
                                }

                                await webServer.sendToOverlay("voting-updater", {
                                    type: 'remove',
                                    overlayInstance: currentPoll.overlayInstance,
                                    config: {
                                        pollTitle: pollId.replace('poll_', '')
                                    }
                                });

                                // Update poll title and related data
                                await votingManager.updatePollTitle(pollId, newPollId, event.effect.newPollTitle);
                                await votingManager.updateRemovedOptionsPollId(pollId, newPollId);

                                // Show updated poll in overlay
                                const updatedPoll = await votingManager.getPoll(newPollId);
                                if (updatedPoll) {
                                    await webServer.sendToOverlay("voting-updater", {
                                        type: 'show',
                                        overlayInstance: updatedPoll.overlayInstance,
                                        config: {
                                            oldPollTitle: pollId.replace('poll_', ''),
                                            pollData: updatedPoll.pollData,
                                            styles: updatedPoll.pollData.styles,
                                            display: updatedPoll.pollData.display,
                                            pollOptions: {
                                                votingCommand: updatedPoll.pollData.votingCommand
                                            },
                                            position: updatedPoll.position,
                                            customCoords: updatedPoll.customCoords
                                        }
                                    });
                                }

                                frontendCommunicator.send("pollRemoved", pollId);
                            }
                        }

                        // Update UI with changes
                        const updatedPoll = await votingManager.getPoll(pollId);
                        if (updatedPoll) {
                            // Preserve existing overlay instance
                            if (!updatedPoll.overlayInstance && event.effect.overlayInstance) {
                                updatedPoll.overlayInstance = event.effect.overlayInstance;
                                await votingManager.updatePoll(pollId, updatedPoll);
                            }

                            // Send updates to overlay
                            await webServer.sendToOverlay("voting-updater", {
                                type: 'update',
                                overlayInstance: updatedPoll.overlayInstance || event.effect.overlayInstance || '',
                                config: {
                                    pollTitle: pollId.replace('poll_', ''),
                                    pollData: updatedPoll.pollData,
                                    styles: updatedPoll.pollData.styles,
                                    display: updatedPoll.pollData.display,
                                    pollOptions: {
                                        votingCommand: updatedPoll.pollData.votingCommand
                                    },
                                    position: updatedPoll.position,
                                    customCoords: updatedPoll.customCoords
                                }
                            });
                        }
                        break;
                    }
                    case 'manageVotes': {
                        let pollWasUpdated = false;  // Track if a real update occurred

                        // Handle direct vote count setting
                        if (event.effect.action === 'set') {
                            const optionNumber = Number(event.effect.optionNumber);
                            const maxOptions = pollData.pollData.options.length;
                            const setCount = Number(event.effect.voteCount);

                            // Get current poll state
                            const poll = await votingManager.getPoll(pollId);
                            if (!poll) return;

                            // Find and validate target option
                            const option = poll.pollData.options.find(opt => opt.option_number === optionNumber);
                            if (!option) {
                                throw new Error(`Option ${optionNumber} does not exist. Available options are 1-${maxOptions}`);
                            }

                            // Only update if count actually changes
                            if (option.votes !== setCount) {
                                // Update vote count and total, ensuring non-negative values
                                const oldVotes = option.votes;
                                option.votes = Math.max(0, setCount);
                                poll.pollData.total_votes += (option.votes - oldVotes);
                                // Update poll
                                await votingManager.updatePoll(pollId, poll);
                                pollWasUpdated = true;
                            }
                        }
                        else {
                            // Handle user-based voting actions
                            const username = event.effect.username || 'System';
                            const optionNumber = Number(event.effect.optionNumber);
                            const maxOptions = pollData.pollData.options.length;

                            // Handle vote reset action
                            if (event.effect.action === 'reset') {
                                await votingManager.updateVote(pollId, username, 0, 'reset');
                                pollWasUpdated = true;
                            }
                            // Handle special case for option 0 (vote all)
                            else if (optionNumber === 0) {
                                const voteAction = event.effect.action === 'add' || event.effect.action === 'remove'
                                    ? event.effect.action
                                    : 'add';
                                await votingManager.updateVote(pollId, username, optionNumber, voteAction);
                                pollWasUpdated = true;
                            }
                            // Validate regular option numbers
                            else if (optionNumber < 1 || optionNumber > maxOptions) {
                                throw new Error(`Option ${optionNumber} does not exist. Available options are 1-${maxOptions}`);
                            }
                            // Process regular vote updates
                            else if (event.effect.action === 'add' || event.effect.action === 'remove') {
                                const poll = await votingManager.getPoll(pollId);
                                if (poll) {
                                    // Validate vote against multiple votes setting
                                    const userVotes = poll.voters[username] || {};
                                    if (event.effect.action === 'add' && !poll.allowMultipleVotes && Object.keys(userVotes).length > 0) {
                                        // Skip update if multiple votes not allowed
                                        break;
                                    }

                                    await votingManager.updateVote(pollId, username, optionNumber, event.effect.action);
                                    pollWasUpdated = true;
                                }
                            }
                        }

                        // Only update overlay if there was an actual change
                        if (pollWasUpdated) {
                            const updatedPoll = await votingManager.getPoll(pollId);
                            if (updatedPoll) {
                                // Send to overlay without another DB update
                                await webServer.sendToOverlay("voting-updater", {
                                    type: 'update',
                                    overlayInstance: updatedPoll.overlayInstance || event.effect.overlayInstance || '',
                                    config: {
                                        pollTitle: pollId.replace('poll_', ''),
                                        pollData: updatedPoll.pollData,
                                        styles: updatedPoll.pollData.styles,
                                        display: updatedPoll.pollData.display,
                                        pollOptions: {
                                            votingCommand: updatedPoll.pollData.votingCommand
                                        },
                                        paused: updatedPoll.paused,
                                        position: updatedPoll.position,
                                        customCoords: updatedPoll.customCoords
                                    }
                                });

                                frontendCommunicator.send('pollDataChanged', pollId);
                            }
                        }
                        break;
                    }

                    case 'getWinningOption': {
                        let pollId: string = await getAsyncPollId(
                            event.effect.pollSelectionMode,
                            event.effect.manualPollTitle,
                            event.effect.pollTitle
                        );

                        const poll = await votingManager.getPoll(pollId);
                        if (!poll || !poll.pollData.options.length) {
                            return {
                                success: true,
                                outputs: {
                                    winningOption: "No options found"
                                }
                            };
                        }

                        // Find highest vote count
                        const maxVotes = Math.max(...poll.pollData.options.map(opt => opt.votes));

                        // Get all options tied for the lead
                        const winners = poll.pollData.options.filter(opt => opt.votes === maxVotes);

                        // Format output based on number of winners
                        const winnerText = winners.length > 1
                            ? `Tie between: ${winners.map(w => `${w.option_name} (${w.votes} votes)`).join(' | ')}`
                            : `${winners[0].option_name} (${winners[0].votes} votes)`;

                        return {
                            success: true,
                            outputs: {
                                winningOption: winnerText
                            }
                        };
                    }

                    default: {
                        throw new Error(`Unknown mode: ${event.effect.mode}`);
                    }
                }

                return { success: true };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return { success: false, error: errorMessage };
            }
        },

        // Configure overlay extension settings
        overlayExtension: {
            dependencies: {
                css: []
            },
            event: {
                name: "voting-updater",
                onOverlayEvent: (data: unknown) => {
                    // Handle string input case first
                    if (typeof data === 'string') {
                        return votingManager.getPoll(data).then(activePoll => ({
                            activePoll: !!activePoll
                        }));
                    }

                    // Check if data is an object with type property
                    if (typeof data !== 'object' || data === null || !('type' in data)) {
                        return votingManager.getPoll(String(data)).then(activePoll => ({
                            activePoll: !!activePoll
                        }));
                    }

                    const eventData = data as { type: string, config?: { pollTitle: string }, overlayInstance?: string };
                    const pollTitle = eventData.config?.pollTitle;

                    if (!pollTitle) {
                        return votingManager.getPoll(String(data)).then(activePoll => ({
                            activePoll: !!activePoll
                        }));
                    }

                    const pollId = `poll_${pollTitle.replace(/[^a-zA-Z0-9]/g, '_')}`;

                    // Helper function to execute script and clean up
                    const executeScript = (scriptContent: string) => {
                        const script = document.createElement('script');
                        script.textContent = scriptContent;
                        document.body.appendChild(script);
                        script.remove();
                    };

                    switch (eventData.type) {
                        case 'remove': {
                            executeScript(`
                                document.querySelectorAll('#${pollId}').forEach(wrapper => {
                                    wrapper.remove();
                                });
                            `);
                            return;
                        }

                        case 'update': {
                            const config = eventData.config as PollConfig;
                            executeScript(`
                                (function() {
                                    const pollUpdateData = {
                                        oldId: '${config.oldPollTitle ? 'poll_' + config.oldPollTitle.replace(/[^a-zA-Z0-9]/g, '_') : ''}',
                                        newId: 'poll_${config.pollTitle.replace(/[^a-zA-Z0-9]/g, '_')}'
                                    };
                                    
                                    // Find existing poll wrapper
                                    let existingWrapper = document.getElementById(pollUpdateData.oldId) || 
                                                        document.getElementById(pollUpdateData.newId);
                                    
                                    if (existingWrapper) {
                                        // Update the wrapper ID if it changed
                                        if (pollUpdateData.oldId && pollUpdateData.oldId !== pollUpdateData.newId) {
                                            existingWrapper.id = pollUpdateData.newId;
                                        }
                                        
                                        // Update position class
                                        const positionClass = '${config.position}'.toLowerCase().replace(' ', '-');
                                        existingWrapper.className = 'position-wrapper ' + positionClass;
                                        
                                        // Update custom coordinates if applicable
                                        const innerPosition = existingWrapper.querySelector('.inner-position');
                                        if (innerPosition) {
                                            if ('${config.position}' === 'Custom' && ${JSON.stringify(config.customCoords)}) {
                                                const coords = ${JSON.stringify(config.customCoords)};
                                                innerPosition.style.position = 'absolute';
                                                innerPosition.style.top = coords.top !== null ? coords.top + 'px' : '';
                                                innerPosition.style.bottom = coords.bottom !== null ? coords.bottom + 'px' : '';
                                                innerPosition.style.left = coords.left !== null ? coords.left + 'px' : '';
                                                innerPosition.style.right = coords.right !== null ? coords.right + 'px' : '';
                                            } else {
                                                innerPosition.style.position = '';
                                                innerPosition.style.top = '';
                                                innerPosition.style.bottom = '';
                                                innerPosition.style.left = '';
                                                innerPosition.style.right = '';
                                            }
                                        }
                                        
                                        // Dispatch update event
                                        window.dispatchEvent(new CustomEvent('votingSystemUpdate', {
                                            detail: {
                                                widgetId: pollUpdateData.newId,
                                                ...${JSON.stringify(eventData)},
                                                show: true                                                
                                            }
                                        }));
                                    } else {
                                        // Create new poll with proper wrapper structure
                                        fetch('http://${window.location.hostname}:7472/integrations/voting-system/voting-system.html')
                                            .then(response => response.text())
                                            .then(template => {
                                                const configString = JSON.stringify({
                                                    ...${JSON.stringify(eventData.config)},
                                                    widgetId: pollUpdateData.newId
                                                }, null, 2);
                        
                                                // Create wrapper structure
                                                const positionClass = '${config.position}'.toLowerCase().replace(' ', '-');
                                                const wrapper = document.createElement('div');
                                                wrapper.id = pollUpdateData.newId;
                                                wrapper.className = 'position-wrapper ' + positionClass;
                        
                                                // Create inner position container
                                                const innerPosition = document.createElement('div');
                                                innerPosition.className = 'inner-position';
                        
                                                // Apply custom coordinates if needed
                                                const config = ${JSON.stringify(eventData.config)};
                                                if (config.position === 'Custom' && config.customCoords) {
                                                    const coords = config.customCoords;
                                                    innerPosition.style.position = 'absolute';
                                                    if (coords.top !== null) innerPosition.style.top = coords.top + 'px';
                                                    if (coords.bottom !== null) innerPosition.style.bottom = coords.bottom + 'px';
                                                    if (coords.left !== null) innerPosition.style.left = coords.left + 'px';
                                                    if (coords.right !== null) innerPosition.style.right = coords.right + 'px';
                                                }
                        
                                                // Update template and add to inner position
                                                const updatedTemplate = template
                                                    .replace(/const CONFIG = {[\\s\\S]*?};/, 'const CONFIG = ' + configString + ';')
                                                    .replace('<div class="pollOverlay"', '<div class="pollOverlay"');
                        
                                                innerPosition.innerHTML = updatedTemplate;
                                                wrapper.appendChild(innerPosition);
                                                $("#wrapper").append(wrapper);
                                            });
                                    }
                                })();
                            `);
                            return;
                        }

                        case 'hide': {
                            executeScript(`
                                document.querySelectorAll('#${pollId}').forEach(wrapper => {
                                    wrapper.style.display = 'none';
                                });
                            `);
                            return;
                        }

                        case 'show': {
                            const config = eventData.config as PollConfig;
                            executeScript(`
                                (function() {
                                    const pollShowData = {
                                        oldId: '${config.oldPollTitle ? 'poll_' + config.oldPollTitle.replace(/[^a-zA-Z0-9]/g, '_') : ''}',
                                        newId: 'poll_${config.pollTitle.replace(/[^a-zA-Z0-9]/g, '_')}'
                                    };
                                    
                                    // Check for existing wrapper with new structure
                                    const existingWrapper = document.getElementById(pollShowData.oldId) || 
                                                          document.getElementById(pollShowData.newId);
                                    
                                    if (existingWrapper) {
                                        existingWrapper.style.display = '';
                                        // Update position class based on stored data
                                        const positionClass = '${config.position}'.toLowerCase().replace(' ', '-');
                                        existingWrapper.className = 'position-wrapper ' + positionClass;
                                        
                                        // Update custom coordinates if applicable
                                        const innerPosition = existingWrapper.querySelector('.inner-position');
                                        if (innerPosition) {
                                            if ('${config.position}' === 'Custom' && ${JSON.stringify(config.customCoords)}) {
                                                const coords = ${JSON.stringify(config.customCoords)};
                                                innerPosition.style.position = 'absolute';
                                                innerPosition.style.top = coords.top !== null ? coords.top + 'px' : '';
                                                innerPosition.style.bottom = coords.bottom !== null ? coords.bottom + 'px' : '';
                                                innerPosition.style.left = coords.left !== null ? coords.left + 'px' : '';
                                                innerPosition.style.right = coords.right !== null ? coords.right + 'px' : '';
                                            } else {
                                                innerPosition.style.position = '';
                                                innerPosition.style.removeProperty('top');
                                                innerPosition.style.removeProperty('bottom');
                                                innerPosition.style.removeProperty('left');
                                                innerPosition.style.removeProperty('right');
                                            }
                                        }
                                        
                                        // Update poll data
                                        window.dispatchEvent(new CustomEvent('votingSystemUpdate', {
                                            detail: {
                                                widgetId: pollShowData.newId,
                                                ...${JSON.stringify(eventData)}
                                            }
                                        }));
                                    } else {
                                        // Create new poll with proper wrapper structure
                                        fetch('http://${window.location.hostname}:7472/integrations/voting-system/voting-system.html')
                                            .then(response => response.text())
                                            .then(template => {
                                                const configString = JSON.stringify({
                                                    ...${JSON.stringify(eventData.config)},
                                                    widgetId: pollShowData.newId
                                                }, null, 2);
                        
                                                // Create wrapper with stored position
                                                const positionClass = '${config.position}'.toLowerCase().replace(' ', '-');
                                                const wrapper = document.createElement('div');
                                                wrapper.id = pollShowData.newId;
                                                wrapper.className = 'position-wrapper ' + positionClass;
                        
                                                // Create inner position container
                                                const innerPosition = document.createElement('div');
                                                innerPosition.className = 'inner-position';
                        
                                                // Apply stored custom coordinates
                                                if ('${config.position}' === 'Custom' && ${JSON.stringify(config.customCoords)}) {
                                                    const coords = ${JSON.stringify(config.customCoords)};
                                                    innerPosition.style.position = 'absolute';
                                                    if (coords.top !== null) innerPosition.style.top = coords.top + 'px';
                                                    if (coords.bottom !== null) innerPosition.style.bottom = coords.bottom + 'px';
                                                    if (coords.left !== null) innerPosition.style.left = coords.left + 'px';
                                                    if (coords.right !== null) innerPosition.style.right = coords.right + 'px';
                                                }
                        
                                                const updatedTemplate = template
                                                    .replace(/const CONFIG = {[\\s\\S]*?};/, 'const CONFIG = ' + configString + ';')
                                                    .replace('<div class="pollOverlay"', '<div class="pollOverlay"');
                        
                                                innerPosition.innerHTML = updatedTemplate;
                                                wrapper.appendChild(innerPosition);
                                                $("#wrapper").append(wrapper);
                                            });
                                    }
                                })();
                            `);
                            return;
                        }

                        default:
                            return votingManager.getPoll(String(data)).then(activePoll => ({
                                activePoll: !!activePoll
                            }));
                    }
                }
            }
        }
    };
    return updateEffectType;
}