import { Firebot } from "@crowbartools/firebot-custom-scripts-types";
import { votingManager } from "../utility/voting-manager";
import backupTemplate from "../templates/backup-template.html";
import { logger } from "../logger";
import { BackupPoll, BackupEffectModel } from "../types/types";

/**
 * Defines and exports a function that creates a custom effect type for the voting system backup
 * functionality in Firebot
 */
export function votingSystemBackupEffectType() {
    // Define the effect type with its configuration and handlers
    const backupEffectType: Firebot.EffectType<BackupEffectModel> = {
        // Basic effect definition including ID, name, and UI properties
        definition: {
            id: "msgg:voting-system-backup",
            name: "Advanced Poll Backup Manager",
            description: "View and restore backed up polls",
            icon: "fad fa-archive",
            categories: ["overlay"]
        },
        // HTML template for the effect's options UI
        optionsTemplate: backupTemplate,
        
        /**
         * Controller for handling the effect's options UI logic
         * @param $scope Angular scope object
         * @param backendCommunicator Service for frontend-backend communication
         * @param $q Angular's promise service
         * @param utilityService Service for utility functions
         */
        optionsController: ($scope: any, backendCommunicator: any, $q: any, utilityService: any) => {
            // Initialize scope variables
            $scope.backupPolls = [];
            $scope.loading = false;

            // Set default effect properties if not already set
            if (!$scope.effect) {
                $scope.effect = {
                    pollSelectionMode: 'pollList',
                    manualPollTitle: '',
                    action: 'restore'
                };
            }

            /**
             * Handles the restoration of a backed up poll
             * @param backupId The ID of the backup to restore
             */
            $scope.restorePoll = (backupId: string) => {
                const pollId = backupId.split('::backup::')[0];
                
                // Check if poll already exists before restoring
                backendCommunicator.fireEventAsync("checkPollExists", { pollId })
                    .then((exists: boolean) => {
                        if (exists) {
                            // Show confirmation modal if poll exists
                            utilityService.showConfirmationModal({
                                title: "Poll Already Exists",
                                question: "A poll with this name already exists. How would you like to proceed?",
                                confirmLabel: "Overwrite",
                                cancelLabel: "Merge",
                                closeLabel: "Cancel",
                                confirmBtnType: "btn-danger"
                            }).then((response: string | boolean) => {
                                // Handle user's choice for existing poll
                                if (response === true) {
                                    return backendCommunicator.fireEventAsync("restorePoll", { backupId, mode: 'overwrite' });
                                } else if (response === false) {
                                    return backendCommunicator.fireEventAsync("restorePoll", { backupId, mode: 'merge' });
                                }
                            }).then(() => {
                                loadBackups();
                            });
                        } else {
                            // If poll doesn't exist, restore directly
                            backendCommunicator.fireEventAsync("restorePoll", { backupId })
                                .then(() => {
                                    loadBackups();
                                });
                        }
                    });
            };

            /**
             * Handles the deletion of a poll
             * @param pollId The ID of the poll to delete
             */
            $scope.deletePoll = (pollId: string) => {
                backendCommunicator.fireEventAsync("removePoll", { pollId })
                    .then(() => {
                        loadBackups();
                    });
            };

            /**
             * Loads backup polls from the backend
             */
            function loadBackups() {
                if ($scope.effect.pollSelectionMode !== 'pollList') return;

                $scope.loading = true;
                backendCommunicator.fireEventAsync("getBackupPolls", {})
                    .then((backups: BackupPoll[]) => {
                        $scope.backupPolls = backups;
                        $scope.loading = false;
                    })
                    .catch(() => {
                        $scope.backupPolls = [];
                        $scope.loading = false;
                    });
            }

            // Watch for changes in poll selection mode
            $scope.$watch('effect.pollSelectionMode', (newMode: string) => {
                if (newMode === 'pollList') {
                    loadBackups();
                }
            });

            // Handler for effect value changes
            $scope.effectValueChanged = () => {
                loadBackups();
            };

            // Initial load of backups
            loadBackups();
        },

        /**
         * Handles the actual triggering of the effect
         * @param event The effect event object
         */
        onTriggerEvent: async (event: { effect: BackupEffectModel }) => {
            if (event.effect.pollSelectionMode === 'manual') {
                // Format poll ID from manual input
                const searchPollId = event.effect.manualPollTitle.startsWith('poll_')
                    ? event.effect.manualPollTitle
                    : `poll_${event.effect.manualPollTitle.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
                if (event.effect.action === 'restore') {
                    // Handle poll restoration
                    const backupPolls = await votingManager.getBackupPolls();
                    
                    let backupId = searchPollId;
                    // Find the most recent backup if not given a specific backup ID
                    if (!searchPollId.includes('::backup::')) {
                        const basePollId = `poll_${searchPollId.replace(/^poll_/, '')}`;
                        const matchingBackup = backupPolls
                            .filter(backup => backup.id!.startsWith(basePollId))
                            .sort((a, b) => new Date(b.removedAt).getTime() - new Date(a.removedAt).getTime())[0];
        
                        if (matchingBackup) {
                            backupId = matchingBackup?.id ?? searchPollId;
                        }
                    }
        
                    // Attempt to restore the backup
                    try {
                        await votingManager.restorePoll(backupId);
                    } catch (error) {
                        logger.warn(`No backup found for poll: ${backupId}`);
                    }
                } else if (event.effect.action === 'remove') {
                    // Handle poll removal
                    await votingManager.removePoll(searchPollId);
                }
            }
        
            return { success: true };
        }
    };
    return backupEffectType;
}