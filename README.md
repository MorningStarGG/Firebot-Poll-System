# Advanced Poll System for Firebot

A comprehensive and feature-rich polling system for Firebot, designed to be HIGHLY customizable.

## Features

### Core Functionality

### Poll Creation & Management
- Create polls with multiple options
- Two input modes:
  - Manual option entry
  - Text area/variable input for bulk option entry
- Automatic or manual poll closing
- Multiple voting modes:
  - Single vote per user
  - Multiple votes per user allowed
- Vote tracking per user
- Vote command customization
- Pause/Resume functionality
- Reset poll votes with 30-second undo window
- Poll backup system with 7-day retention
- Option to start/stop polls manually
- Automatic cleanup of ended polls after 7 days

### Poll Options Management
- Add new options to existing polls
- Remove options with backup storage
- Restore removed options (1-hour retention)
- Rename existing options
- Rename entire polls
- Reset specific user's votes
- Add/remove votes for specific options
- Set exact vote counts for options
- Allow voting for all options at once (option 0)

## Display Features

### Visual Customization
- Custom background color
- Custom accent color
- Custom text color
- Custom title color
- Custom progress bar colors:
  - Track color
  - Progress color
  - Progress text color
- Custom text shadow color
- Adjustable poll scale
- Custom poll width
- Custom font size
- Optional custom CSS

### Display Options
- Toggle vote count visibility
- Toggle percentage display
- Toggle voting command display
- Toggle progress animation
- Emoji control:
  - Remove emojis from title
  - Remove emojis from options

### Positioning
- 9 preset positions:
  - Top Left/Middle/Right
  - Middle Left/Center/Right
  - Bottom Left/Middle/Right
- Random position option
- Custom coordinate positioning
- Multiple overlay instance support

### Animations
Included are animations for the following events:
1. When a poll starts poll will transition onto the screen smoothly
2. When a poll ends, the winning option(s) will be highlighted with:
    - Crown icon
    - Pulsing animation
    - Confetti effect
    - Highlighted border
    - Ended indicator will show
3. Pausing a poll, the poll will do the following:
    - Frost/freeze/blur effect on the poll
    - Poll progress track fades
    - Pause Indicator will show
4. Resuming a poll
5. Resetting a poll, the poll will do the following:
    - Reset all votes by counting bakwards any votes on both the bar, and text
    - Glitch effect on the poll
6. Voting on a poll, the poll will do the following:
    - Poll will have a swiping animation
    - Poll will have progress bars smoothly animate forwards/backwards dynnamically based on the vote cast

## Events System

### Poll Events
- Poll Start Event
- Poll Stop Event

## Variables System

### Poll Information Variables
- `$pollWinners` - Get winning options with configurable display
- `$pollStats` - Get vote statistics with formatting options
- `$pollStatus` - Get current poll state (active/ended/paused)
- `$pollName` - Get poll title with emoji control
- `$pollTime` - Get timing information (end time/remaining/duration)
- `$pollOptions` - Get formatted option lists
- `$pollUserVotes` - Get user voting information
- `$pollStopMethod` - Get how poll was stopped
- `$findPollId` - Search for polls by keyword

### Variable Display Options
- Multiple formatting options for each variable
- Customizable output formats
- Support for raw data output
- Emoji control in outputs
- Time formatting options

## Backup System

### Backup Features
- Automatic backup on poll removal
- 7-day backup retention
- Backup restoration options:
  - Full restore
  - Merge with existing poll
  - Overwrite existing poll
- Backup browsing interface
- Manual backup deletion

## UI Elements

### Real-time UI Features
- Live vote updates
- Animated progress bars
- Interactive option management
- Pause state visualization
- Winner highlighting
- Error handling with user feedback

## Technical Features

### Data Management
- Local database storage
- Automatic data cleanup
- Vote history tracking
- Option history tracking
- User vote tracking
- Multiple overlay instance support
- Unicode characters and emojis support  

### Accessibility
- ARIA labels throughout UI

## Usage

### Creating a Poll
1. Add the "Advanced Poll System" effect to any effect list
2. Configure the basic poll settings:
    - Set the poll title
    - Add options (either manually or via text/variables)
    - Configure the voting command (default: !vote)
    - Set auto-close options if desired
3. It's HIGHLY suggested to create commands to support different settings and use manual poll selection instead of "list" mode.

### Tips and Best Practices
1. Use descriptive poll titles for easier management
2. Regularly clean up ended polls using the backup manager
3. Test poll visibility and positioning before going live
4. Use variables for dynamic poll creation
5. Consider your overlay layout when positioning polls

### Known Limitations
- Maximum number of options is limited by display space
- Some animations may impact performance on lower-end systems  

## Installation

### Script Installation
1. Download the script files or build it from source following the below instructions
2.  **Place the Script in Firebot Scripts Folder**
    - In Firebot, navigate to **Settings > Scripts > Manage Startup Scripts**.
    - Click **Add New Script**.
    - In the blue notification bar, click the link labeled **scripts folder**.
    - Copy the downloaded script into this folder.
    - Hit the **refresh button** beside the **Select script** dropdown.
    - Select **MSGG-VotingSystem.js** from the dropdown menu.
    - Click **Save**.
3. The script will add three new effects for use in Firebot: Advanced Poll System, Advanced Poll Manager, Advanced Poll Backup Manager
4. The script will also add two new events for use in Firebot: Advanced Poll System Poll Started, Advanced Poll System Poll Stopped 

### Building
1. Clone the repository:
```
git clone https://github.com/your-repo/firebot-advanced-goal-tracker.git
```
2. Install dependencies:
```
npm install
```
3. Build the script:
```
npm run build:prod
```

## Technical Support

### Troubleshooting
If a poll isn't displaying:
1. Check that the Firebot overlay is loaded in your streaming software
2. Verify the selected overlay instance matches your configuration
3. Ensure the poll hasn't been automatically closed & try "showing" the poll again
4. Check the position settings  

### Requirements

- Firebot 5.63.2 or higher  

### Support

For issues, questions, or feature requests:
    - Open an issue on GitHub
    - Join the Firebot Discord server

## License

This script is provided as-is under the GPL-3.0 license. You are free to modify and distribute it according to your needs.

## Acknowledgments

Special thanks to the Firebot community for their support and contributions.
---
**AI Disclaimer:** Parts of this was made with various AI tools to speed development time.