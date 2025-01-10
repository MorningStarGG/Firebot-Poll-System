import { ScriptModules } from '@crowbartools/firebot-custom-scripts-types';
import { emitPollStop, emitPollStart } from '../events/voting-system-events';
import { JsonDB } from 'node-json-db';
import { PollState, BackupPoll, PollOption, RemovedOption, PollAction } from '../types/types';
import { webServer } from "../main";
import { logger } from "../logger";

class VotingManager {
    private _db: JsonDB;
    private _tempResetStorage: Map<string, { data: PollState, timestamp: number }> = new Map();
    private readonly TEMP_STORAGE_DURATION = 30000; // 30 seconds retention

    constructor(path: string, modules: ScriptModules) {
        // @ts-ignore
        this._db = new modules.JsonDb(path, true, true);
    }

    async resetPollWithUndo(pollId: string): Promise<void> {
        const currentPoll = await this.getPoll(pollId);
        if (!currentPoll) return;

        // Store the entire current state, including voters
        this._tempResetStorage.set(pollId, {
            data: JSON.parse(JSON.stringify(currentPoll)), // Deep clone to preserve all data
            timestamp: Date.now()
        });

        // Add timeout to clear the data after 30 seconds
        setTimeout(() => {
            this._tempResetStorage.delete(pollId);
        }, this.TEMP_STORAGE_DURATION);

        this.cleanTempStorage();
        await this.resetPoll(pollId);
    }

    async undoReset(pollId: string): Promise<boolean> {
        const storedData = this._tempResetStorage.get(pollId);
        if (!storedData) return false;

        // Restore complete poll state, including voters
        await this.updatePoll(pollId, storedData.data);
        this._tempResetStorage.delete(pollId);

        await webServer.sendToOverlay("voting-updater", {
            type: 'update',
            overlayInstance: storedData.data.overlayInstance,
            config: {
                pollTitle: pollId.replace('poll_', ''),
                pollData: storedData.data.pollData,
                styles: storedData.data.pollData.styles,
                display: storedData.data.pollData.display,
                pollOptions: {
                    votingCommand: storedData.data.pollData.votingCommand,
                    allowMultipleVotes: storedData.data.allowMultipleVotes
                },
                position: storedData.data.position,
                customCoords: storedData.data.customCoords
            }
        });

        return true;
    }

    async canUndoReset(pollId: string): Promise<boolean> {
        const storedData = this._tempResetStorage.get(pollId);
        if (!storedData) return false;
        return (Date.now() - storedData.timestamp) < this.TEMP_STORAGE_DURATION;
    }

    private cleanTempStorage(): void {
        const now = Date.now();
        for (const [pollId, { timestamp }] of this._tempResetStorage) {
            if (now - timestamp > this.TEMP_STORAGE_DURATION) {
                this._tempResetStorage.delete(pollId);
            }
        }
    }

    async getPoll(pollId: string): Promise<PollState | undefined> {
        try {
            const data = await this._db.getData(`/polls/${pollId}`);
            return data as PollState;
        } catch {
            return undefined;
        }
    }

    async isPollActive(pollId: string): Promise<boolean> {
        const poll = await this.getPoll(pollId);
        return !!poll && !poll.ended;
    }

    async getActivePolls(): Promise<string[]> {
        try {
            const data = await this._db.getData('/polls');
            console.log('Current polls in database:', data);
            const activePolls = Object.entries(data)
                .filter(([_, poll]) => {
                    const pollState = poll as PollState;
                    return !pollState.ended;
                })
                .map(([pollId]) => pollId);
            console.log('Active polls found:', activePolls);
            return activePolls;
        } catch {
            return [];
        }
    }

    async getEndedPolls(): Promise<string[]> {
        try {
            const data = await this._db.getData('/polls');
            console.log('Current polls in database:', data);
            const endedPolls = Object.entries(data)
                .filter(([_, poll]) => {
                    const pollState = poll as PollState;
                    return pollState.ended;
                })
                .map(([pollId]) => pollId);
            console.log('Active polls found:', endedPolls);
            return endedPolls;
        } catch {
            return [];
        }
    }

    async getAllPollsWithStatus(): Promise<Array<{ pollId: string, displayTitle: string, status: 'active' | 'stopped' }>> {
        try {
            const data = await this._db.getData('/polls');
            console.log('Current polls in database:', data);
            return Object.entries(data).map(([pollId, poll]) => ({
                pollId: pollId, // Keep the internal ID for database operations
                displayTitle: (poll as PollState).pollData.title, // Original title for display
                status: (poll as PollState).ended ? 'stopped' : 'active'
            }));
        } catch {
            return [];
        }
    }

    async stopPoll(pollId: string, stopType: 'manual' | 'automatic' = 'manual', eventManager: any) {
        const poll = await this.getPoll(pollId);
        if (!poll) return;

        // First update poll state
        poll.ended = true;
        poll.updatedAt = new Date().toISOString();
        poll.closeTime = new Date().toISOString();
        await this.updatePoll(pollId, poll);

        // Then emit event non-blocking
        emitPollStop(eventManager, {
            pollId: pollId,
            pollTitle: pollId.replace('poll_', ''),
            totalVotes: poll.pollData.total_votes,
            stopType: stopType,
            options: poll.pollData.options,
            startTime: poll.createdAt
        }).catch(error => {
            console.error('Error emitting poll stop event:', error);
        });
    }

    async startPoll(pollId: string, eventManager: any) {
        const poll = await this.getPoll(pollId);
        if (!poll) return;
    
        poll.ended = false;
        poll.updatedAt = new Date().toISOString();
        poll.closeTime = undefined;
        await this.updatePoll(pollId, poll);
    
        // Emit poll start event
        emitPollStart(eventManager, {
            pollId: pollId,
            pollTitle: poll.pollData.title,
            options: poll.pollData.options.map(opt => opt.option_name),
            duration: poll.closeTime || 0
        });
    }

    async checkAndClosePoll(pollId: string): Promise<void> {
        const poll = await this.getPoll(pollId);
        if (!poll) return;

        try {
            // Send update to show poll as ended but keep it visible
            await webServer.sendToOverlay("voting-updater", {
                type: 'update',
                overlayInstance: poll.overlayInstance,
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
                    ended: true
                }
            });

            // Schedule removal after display duration
            setTimeout(async () => {
                try {
                    await webServer.sendToOverlay("voting-updater", {
                        type: 'remove',
                        config: {
                            pollTitle: pollId.replace('poll_', '')
                        }
                    });
                } catch (error) {
                    console.error('Error removing poll from overlay:', error);
                }
            }, (poll.displayDuration || 30) * 1000);
        } catch (error) {
            console.error('Error in checkAndClosePoll:', error);
            throw error; // Propagate error to allow proper handling
        }
    }

    async getWinningOption(pollId: string): Promise<PollOption | undefined> {
        const poll = await this.getPoll(pollId);
        if (!poll || !poll.pollData.options.length) return undefined;

        return poll.pollData.options.reduce((prev, current) =>
            (prev.votes > current.votes) ? prev : current
        );
    }

    async updatePoll(pollId: string, pollState: PollState): Promise<void> {
        pollState.updatedAt = new Date().toISOString();
        if (!pollState.overlayInstance) {
            pollState.overlayInstance = '';
        }
        await this._db.push(`/polls/${pollId}`, pollState, true);
    }

    async updateVote(pollId: string, username: string, optionNumber: number, action: PollAction, setCount?: number): Promise<void> {
        const pollState = await this.getPoll(pollId);
        if (!pollState || pollState.paused) return;

        // Initialize voters if doesn't exist
        if (!pollState.voters) {
            pollState.voters = {};
        }

        // Initialize user's votes if doesn't exist
        if (!pollState.voters[username]) {
            pollState.voters[username] = {};
        }

        if (action === 'reset') {
            // Get all the user's votes
            const userVotes = pollState.voters[username];

            // Remove all votes by this user
            for (const [optNum, voteCount] of Object.entries(userVotes)) {
                const option = pollState.pollData.options.find(opt => opt.option_number === parseInt(optNum));
                if (option) {
                    option.votes -= voteCount;
                    pollState.pollData.total_votes -= voteCount;
                }
            }

            // Clear the user's voting record
            pollState.voters[username] = {};

            await this.updatePoll(pollId, pollState);
            return;
        }

        const userVotes = pollState.voters[username];

        if (action === 'add' && !pollState.allowMultipleVotes && Object.keys(userVotes).length > 0) {
            // User has already voted and multiple votes aren't allowed
            return;
        }

        // Special handling for optionNumber 0 - vote for all options
        if (optionNumber === 0 && action === 'add') {
            // First, if not allowing multiple votes, clear any existing votes
            if (!pollState.allowMultipleVotes) {
                // Remove existing votes from total count
                for (const [optNum, voteCount] of Object.entries(userVotes)) {
                    const existingOption = pollState.pollData.options.find(opt => opt.option_number === parseInt(optNum));
                    if (existingOption) {
                        existingOption.votes -= voteCount;
                        pollState.pollData.total_votes -= voteCount;
                    }
                }
                // Clear user's vote history
                pollState.voters[username] = {};
            }

            // Add one vote to each option
            for (const option of pollState.pollData.options) {
                option.votes++;
                // Track the vote for this user
                if (!pollState.voters[username][option.option_number]) {
                    pollState.voters[username][option.option_number] = 0;
                }
                pollState.voters[username][option.option_number]++;
            }
            // Update total votes
            pollState.pollData.total_votes += pollState.pollData.options.length;

            await this.updatePoll(pollId, pollState);
            return;
        }

        const option = pollState.pollData.options.find(opt => opt.option_number === optionNumber);
        if (!option) return;

        if (action === 'set' && setCount !== undefined) {
            const currentVotes = userVotes[optionNumber] || 0;
            const voteDiff = setCount - currentVotes;
            option.votes += voteDiff;
            pollState.pollData.total_votes += voteDiff;
            if (setCount > 0) {
                userVotes[optionNumber] = setCount;
            } else {
                delete userVotes[optionNumber];
            }
        } else if (action === 'add') {
            option.votes++;
            if (!userVotes[optionNumber]) {
                userVotes[optionNumber] = 0;
            }
            userVotes[optionNumber]++;
            pollState.pollData.total_votes++;
        } else if (action === 'remove' && option.votes > 0) {
            const currentVotes = userVotes[optionNumber] || 0;
            if (currentVotes > 0) {
                option.votes--;
                userVotes[optionNumber]--;
                if (userVotes[optionNumber] === 0) {
                    delete userVotes[optionNumber];
                }
                pollState.pollData.total_votes--;
            }
        }

        await this.updatePoll(pollId, pollState);
    }


    async addOption(pollId: string, optionName: string): Promise<void> {
        const pollState = await this.getPoll(pollId);
        if (!pollState) return;

        const maxOptionNumber = Math.max(
            ...pollState.pollData.options.map(opt => opt.option_number),
            0
        );

        const newOption = {
            option_number: maxOptionNumber + 1,
            option_name: optionName.trim(),
            votes: 0
        };

        pollState.pollData.options.push(newOption);
        await this.updatePoll(pollId, pollState);
    }

    async updateOptions(pollId: string, newOptions: Array<{ option_name: string; option_number: number }>): Promise<void> {
        const pollState = await this.getPoll(pollId);
        if (!pollState) return;

        // Find options that have been renamed
        const oldOptions = pollState.pollData.options;
        const changedOptions = newOptions.map(newOpt => {
            const oldOpt = oldOptions.find(o => o.option_number === newOpt.option_number);
            return {
                oldName: oldOpt?.option_name,
                newName: newOpt.option_name,
                option_number: newOpt.option_number
            };
        }).filter(opt => opt.oldName && opt.oldName !== opt.newName);

        // Create a map using option numbers to preserve their votes
        const existingOptionsMap = new Map(
            pollState.pollData.options.map(opt => [opt.option_number, opt])
        );

        // Update options while preserving votes by option number
        pollState.pollData.options = newOptions.map((newOpt, index) => {
            const existingOption = existingOptionsMap.get(newOpt.option_number);
            return {
                option_number: index + 1,
                option_name: newOpt.option_name.trim(),
                votes: existingOption ? existingOption.votes : 0
            };
        });

        // Recalculate total votes
        pollState.pollData.total_votes = pollState.pollData.options.reduce(
            (sum, opt) => sum + opt.votes,
            0
        );

        // Update the main poll first
        await this.updatePoll(pollId, pollState);

        // Update any matching removed options
        if (changedOptions.length > 0) {
            const removedOptions = await this.getRemovedOptions(pollId);
            for (const [key, removedOpt] of Object.entries(removedOptions)) {
                // Find if this removed option matches any of our renamed options
                const matchingChange = changedOptions.find(change =>
                    removedOpt.option_name === change.oldName
                );
                if (matchingChange) {
                    await this._db.push(`/removedOptions/${pollId}/${removedOpt.formerNumber}/option_name`,
                        matchingChange.newName.trim());
                }
            }
        }

        await webServer.sendToOverlay("voting-updater", {
            type: 'update',
            overlayInstance: pollState.overlayInstance,
            config: {
                pollTitle: pollId.replace('poll_', ''),
                pollData: pollState.pollData,
                styles: pollState.pollData.styles,
                display: pollState.pollData.display,
                pollOptions: {
                    votingCommand: pollState.pollData.votingCommand
                },
                position: pollState.position,
                customCoords: pollState.customCoords
            }
        });
    }

    async updatePollTitle(oldPollId: string, newPollId: string, displayTitle: string): Promise<void> {
        try {
            // Get current poll data with all properties including position
            const pollData = await this.getPoll(oldPollId);
            if (!pollData) {
                console.error('Original poll not found:', oldPollId);
                return;
            }

            // Create updated poll data maintaining all properties
            const updatedPollData = {
                ...pollData,
                pollData: {
                    ...pollData.pollData,
                    title: displayTitle
                },
                position: pollData.position,           // Preserve position
                customCoords: pollData.customCoords,    // Preserve coordinates
                overlayInstance: pollData.overlayInstance
            };

            // Create the new poll with all preserved data
            await this._db.push(`/polls/${newPollId}`, updatedPollData);

            // Handle removed options
            try {
                const removedOptions = await this.getRemovedOptions(oldPollId);
                if (Object.keys(removedOptions).length > 0) {
                    await this._db.push(`/removedOptions/${newPollId}`, removedOptions);
                    await this._db.delete(`/removedOptions/${oldPollId}`);
                }
            } catch (error) {
                console.error('Error handling removed options:', error);
            }

            // Delete the old poll after everything else succeeds
            await this._db.delete(`/polls/${oldPollId}`);

            // Send overlay update with preserved position data
            await webServer.sendToOverlay("voting-updater", {
                type: 'update',
                overlayInstance: updatedPollData.overlayInstance,
                config: {
                    oldPollTitle: oldPollId.replace('poll_', ''),
                    pollTitle: displayTitle,
                    pollData: updatedPollData.pollData,
                    styles: updatedPollData.pollData.styles,
                    display: updatedPollData.pollData.display,
                    pollOptions: {
                        votingCommand: updatedPollData.pollData.votingCommand
                    },
                    position: updatedPollData.position,
                    customCoords: updatedPollData.customCoords
                }
            });
        } catch (error) {
            console.error('Error updating poll title:', error);
            throw error;
        }
    }


    async updateRemovedOptionsPollId(oldPollId: string, newPollId: string): Promise<void> {
        try {
            const removedOptions = await this.getRemovedOptions(oldPollId);
            if (Object.keys(removedOptions).length > 0) {
                await this._db.push(`/removedOptions/${newPollId}`, removedOptions);
                await this._db.delete(`/removedOptions/${oldPollId}`);
            }
        } catch (error) {
            console.error('Error updating removed options poll ID:', error);
        }
    }

    async updateRemovedOptionName(pollId: string, optionNumber: number, newName: string): Promise<void> {
        try {
            const removedOptions = await this.getRemovedOptions(pollId);
            if (removedOptions[optionNumber]) {
                console.log(`Updating removed option name for poll ${pollId}, option ${optionNumber} to ${newName}`);
                // Create updated option data
                const updatedOption = {
                    ...removedOptions[optionNumber],
                    option_name: newName.trim()
                };
                // Update the full option data
                await this._db.push(`/removedOptions/${pollId}/${optionNumber}`, updatedOption);
            }
        } catch (error) {
            console.error('Error updating removed option name:', error);
            throw error;
        }
    }

    async getRemovedOptionsFormatted(pollId: string): Promise<string> {
        const removedOptions = await this.getRemovedOptions(pollId);
        return Object.values(removedOptions)
            .map(opt => `${opt.option_name} (${opt.votes} votes)`)
            .join(' | ');
    }

    async storeRemovedOption(pollId: string, option: PollOption): Promise<void> {
        // First store the removed option
        const removedOption: RemovedOption = {
            ...option,
            removedAt: new Date().toISOString(),
            originalPollId: pollId,
            formerNumber: option.option_number
        };

        await this._db.push(`/removedOptions/${pollId}/${option.option_number}`, removedOption);

        // Get current poll state
        const pollState = await this.getPoll(pollId);
        if (!pollState) return;

        // Remove the option and renumber remaining options while preserving all data
        pollState.pollData.options = pollState.pollData.options
            .filter(opt => opt.option_number !== option.option_number)
            .map((opt, index) => ({
                ...opt,  // This preserves all option data including votes
                option_number: index + 1  // Only update the option number
            }));

        // Recalculate total votes
        pollState.pollData.total_votes = pollState.pollData.options.reduce(
            (sum, opt) => sum + opt.votes,
            0
        );

        // Update the poll in the database
        await this.updatePoll(pollId, pollState);

        // Send update to overlay
        await webServer.sendToOverlay("voting-updater", {
            type: 'update',
            overlayInstance: pollState.overlayInstance,
            config: {
                pollTitle: pollId.replace('poll_', ''),
                pollData: pollState.pollData,
                styles: pollState.pollData.styles,
                display: pollState.pollData.display,
                pollOptions: {
                    votingCommand: pollState.pollData.votingCommand
                },
                position: pollState.position,
                customCoords: pollState.customCoords
            }
        });
    }

    async getRemovedOptions(pollId: string): Promise<Record<string, RemovedOption>> {
        try {
            console.log('Getting removed options for poll:', pollId);
            const data = await this._db.getData(`/removedOptions/${pollId}`);
            console.log('Found removed options:', data);
            return data || {};
        } catch (error) {
            console.log('Error getting removed options:', error);
            return {};
        }
    }

    async restoreOption(pollId: string, optionNumber: number): Promise<void> {
        try {
            // Get the removed option data
            const removedOptionsData = await this._db.getData(`/removedOptions/${pollId}`);
            const removedOption = removedOptionsData[optionNumber];

            if (!removedOption) {
                console.error('Removed option not found:', { pollId, optionNumber });
                return;
            }

            // Get current poll state
            const pollState = await this.getPoll(pollId);
            if (!pollState) {
                console.error('Poll not found:', pollId);
                return;
            }

            // Find index of any existing option with the same name
            const existingIndex = pollState.pollData.options.findIndex(
                opt => opt.option_name.toLowerCase() === removedOption.option_name.toLowerCase()
            );

            // Adjust total votes by removing existing option's votes if found
            if (existingIndex !== -1) {
                const existingOption = pollState.pollData.options[existingIndex];
                pollState.pollData.total_votes -= existingOption.votes;
                // Replace the existing option
                pollState.pollData.options[existingIndex] = {
                    option_number: existingOption.option_number,
                    option_name: removedOption.option_name,
                    votes: removedOption.votes
                };
            } else {
                // Add as new option if no match found
                const maxOptionNumber = Math.max(
                    ...pollState.pollData.options.map(opt => opt.option_number),
                    0
                );

                const restoredOption = {
                    option_number: maxOptionNumber + 1,
                    option_name: removedOption.option_name,
                    votes: removedOption.votes
                };

                pollState.pollData.options.push(restoredOption);
            }

            // Add restored option's votes to total
            pollState.pollData.total_votes += removedOption.votes;

            // Update the poll
            await this.updatePoll(pollId, pollState);

            // Remove from removed options
            await this._db.delete(`/removedOptions/${pollId}/${optionNumber}`);

            // Move the overlay update outside the try block but after all operations
            await webServer.sendToOverlay("voting-updater", {
                type: 'update',
                overlayInstance: pollState.overlayInstance,
                config: {
                    pollTitle: pollId.replace('poll_', ''),
                    pollData: pollState.pollData,
                    styles: pollState.pollData.styles,
                    display: pollState.pollData.display,
                    pollOptions: {
                        votingCommand: pollState.pollData.votingCommand
                    },
                    position: pollState.position,
                    customCoords: pollState.customCoords
                }
            });

            console.log('Option restore completed successfully');
        } catch (error) {
            console.error('Error restoring option:', error);
            throw error;
        }
    }

    async createPoll(pollId: string, pollState: PollState): Promise<void> {
        await this.updatePoll(pollId, pollState);
    }

    async resetPoll(pollId: string): Promise<void> {
        const pollState = await this.getPoll(pollId);
        if (!pollState) return;

        // Reset all option votes to 0
        pollState.pollData.options.forEach(option => {
            option.votes = 0;
        });

        // Reset total votes
        pollState.pollData.total_votes = 0;

        // Clear all voters
        pollState.voters = {};

        await this.updatePoll(pollId, pollState);
    }

    async removePoll(pollId: string): Promise<void> {
        try {
            await this._db.delete(`/backups/${pollId}`);
        } catch (error) {
            console.error(`Failed to remove backup poll ${pollId}:`, error);
            throw error;
        }
    }

    async pausePoll(pollId: string) {
        const poll = await this.getPoll(pollId);
        if (poll) {
            poll.paused = true;
            await this.updatePoll(pollId, poll);
            return poll;
        }
        return null;
    }

    async unpausePoll(pollId: string) {
        const poll = await this.getPoll(pollId);
        if (poll) {
            poll.paused = false;
            await this.updatePoll(pollId, poll);
            return poll;
        }
        return null;
    }

    async checkPollExists(pollId: string): Promise<boolean> {
        try {
            await this._db.getData(`/polls/${pollId}`);
            return true;
        } catch {
            return false;
        }
    }

    async getBackupPolls(): Promise<BackupPoll[]> {
        try {
            const backups = await this._db.getData('/backups');
            return Object.entries(backups).map(([pollId, backup]) => ({
                ...backup as BackupPoll,
                id: pollId  // This adds the id property
            }));
        } catch {
            return [];
        }
    }

    async backupPoll(pollId: string): Promise<void> {
        const poll = await this.getPoll(pollId);
        if (!poll) return;

        const backupId = `${pollId}::backup::${Date.now()}`;
        const backup: BackupPoll = {
            ...poll,
            removedAt: new Date().toISOString()
        };

        await this._db.push(`/backups/${backupId}`, backup);
        await this._db.delete(`/polls/${pollId}`);
    }

    async restorePoll(backupId: string, mode?: 'merge' | 'overwrite'): Promise<void> {
        console.log('Starting restore operation:', { backupId, mode });
        const backup = await this._db.getData(`/backups/${backupId}`);
        if (!backup) {
            console.log('No backup found for:', backupId);
            return;
        }

        const { removedAt, ...backupPollState } = backup;
        const pollId = backupId.split('::backup::')[0];
        console.log('Backup poll state:', backupPollState);

        if (mode === 'merge') {
            const existingPoll = await this.getPoll(pollId);
            if (existingPoll) {
                console.log('Existing poll before merge:', existingPoll);

                // Create a map of existing options for easy lookup
                const existingOptionsMap = new Map(
                    existingPoll.pollData.options.map(opt => [opt.option_name, opt])
                );

                // Merge existing options with backup options
                const mergedOptions = [...existingPoll.pollData.options];

                // Add or merge backup options
                backupPollState.pollData.options.forEach((backupOption: { option_name: string; option_number: number; votes: number }) => {
                    const existingOption = existingOptionsMap.get(backupOption.option_name);
                    if (existingOption) {
                        existingOption.votes += backupOption.votes;
                    } else {
                        mergedOptions.push({
                            ...backupOption,
                            option_number: mergedOptions.length + 1
                        });
                    }
                });

                existingPoll.pollData.options = mergedOptions;
                existingPoll.pollData.total_votes = mergedOptions.reduce((sum, opt) => sum + opt.votes, 0);

                console.log('Poll after merge:', existingPoll);
                await this.updatePoll(pollId, existingPoll);

                // Send update to overlay
                await webServer.sendToOverlay("voting-updater", {
                    type: 'update',
                    overlayInstance: existingPoll.overlayInstance,
                    config: {
                        pollTitle: pollId.replace('poll_', ''),
                        pollData: existingPoll.pollData,
                        styles: existingPoll.pollData.styles,
                        display: existingPoll.pollData.display,
                        pollOptions: {
                            votingCommand: existingPoll.pollData.votingCommand
                        },
                        position: existingPoll.position,
                        customCoords: existingPoll.customCoords
                    }
                });
            }
        } else {
            // For overwrite, directly use the backup data
            await this._db.push(`/polls/${pollId}`, backupPollState);

            // Send update to overlay
            await webServer.sendToOverlay("voting-updater", {
                type: 'update',
                overlayInstance: backupPollState.overlayInstance,
                config: {
                    pollTitle: pollId.replace('poll_', ''),
                    pollData: backupPollState.pollData,
                    styles: backupPollState.pollData.styles,
                    display: backupPollState.pollData.display,
                    pollOptions: {
                        votingCommand: backupPollState.pollData.votingCommand
                    },
                    position: backupPollState.position,
                    customCoords: backupPollState.customCoords
                }
            });
        }

        await this._db.delete(`/backups/${backupId}`);
    }

    async cleanupOldBackups(): Promise<void> {
        try {
            // Clean old backups (existing code)
            const backups = await this._db.getData('/backups') as Record<string, BackupPoll>;
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            for (const [pollId, backup] of Object.entries(backups)) {
                if (new Date(backup.removedAt) < sevenDaysAgo) {
                    await this._db.delete(`/backups/${pollId}`);
                }
            }

            // Clean ended polls
            const polls = await this._db.getData('/polls') as Record<string, PollState>;
            for (const [pollId, poll] of Object.entries(polls)) {
                if (poll.ended && poll.closeTime && new Date(poll.closeTime) < sevenDaysAgo) {
                    await this._db.delete(`/polls/${pollId}`);
                }
            }

            // Clean orphaned and old removed options
            const removedOptions = await this._db.getData('/removedOptions') as Record<string, Record<string, RemovedOption>>;
            const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000));

            for (const [pollId, options] of Object.entries(removedOptions)) {
                const pollExists = await this.checkPollExists(pollId);

                if (!pollExists) {
                    await this._db.delete(`/removedOptions/${pollId}`);
                    continue;
                }

                for (const [optionNumber, option] of Object.entries(options)) {
                    const removedAt = new Date(option.removedAt);
                    if (removedAt < oneHourAgo) {
                        await this._db.delete(`/removedOptions/${pollId}/${optionNumber}`);
                    }
                }
            }
        } catch (error) {
            console.log('No data to clean or error occurred:', error);
        }
    }


}

export let votingManager: VotingManager;

export function createVotingManager(path: string, modules: ScriptModules): VotingManager {
    if (!votingManager) {
        votingManager = new VotingManager(path, modules);
    }
    return votingManager;
}