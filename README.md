## Micro-Challenges: Feel Good Kickstart

A simple mobile application designed to help users effortlessly build micro-habits and improve daily well-being through small, manageable Micro-Challenges. The core philosophy is consistency over complexity.

## Key Features

    * Micro-Challenge Delivery: Delivers small, actionable tasks (e.g., "Drink water," "Stretch") up to three times per hour.

    High-Satisfaction UI: Features a premium, bubbly design with highly polished animations and a dramatic visual satisfaction burst (confetti-like pop) on challenge completion.

    Tactile Feedback: Uses heavy haptics and custom animations for a satisfying, responsive experience.

    Short Cooldown: Implements a brief 5-second cooldown after each action to encourage quick, continuous re-engagement.

    Local Data: Progress is securely tracked and saved locally using AsyncStorage.

    Optional Notifications: Supports local notifications to prompt users for their mini-boosts.

## Tech Stack and Setup

This project is built using React Native with Expo, leveraging TypeScript for type safety and the Animated API for the custom UI effects.

## Prerequisites

You'll need Node.js, npm, and the Expo Go app installed on your mobile device for testing.

## Installation

    Clone the repository:
    Bash

git clone [Your Repo URL]
cd feel-good-kickstart

## Install dependencies: This project relies on a few key Expo packages for the premium experience.
Bash

npm install 
npx expo install expo-linear-gradient expo-notifications expo-haptics

## Start the application:
Bash

    npx expo start

    Run: Scan the QR code displayed in your terminal using the Expo Go app to launch the application on your device.

## License

This project is released under the MIT License.
