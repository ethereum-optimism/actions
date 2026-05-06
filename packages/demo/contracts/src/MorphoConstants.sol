// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title MorphoConstants
/// @notice Shared baseSepolia addresses for the Morpho Blue ecosystem. Keep
///         deploy scripts and tests in sync by importing from here rather than
///         redeclaring.
library MorphoConstants {
    address internal constant MORPHO = 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address internal constant METAMORPHO_FACTORY_V1_1 = 0x2c3FE6D71F8d54B063411Abb446B49f13725F784;
    address internal constant IRM = 0x46415998764C29aB2a25CbeA6254146D50D22687;
}
