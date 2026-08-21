// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockScheduler {
    struct ScheduledCall {
        bytes data;
        uint32 gasLimit;
        uint32 startBlock;
        uint32 numCalls;
        uint32 frequency;
        uint32 ttl;
        uint256 maxFeePerGas;
        address payer;
    }

    uint256 public nextCallId;
    mapping(uint256 => ScheduledCall) private _calls;
    mapping(uint256 => bool) public cancelled;

    function approveScheduler(address) external {}

    function schedule(
        bytes calldata data,
        uint32 gasLimit,
        uint32 startBlock,
        uint32 numCalls,
        uint32 frequency,
        uint32 ttl,
        uint256 maxFeePerGas,
        uint256,
        uint256,
        address payer
    ) external returns (uint256 callId) {
        callId = ++nextCallId;
        _calls[callId] = ScheduledCall({
            data: data,
            gasLimit: gasLimit,
            startBlock: startBlock,
            numCalls: numCalls,
            frequency: frequency,
            ttl: ttl,
            maxFeePerGas: maxFeePerGas,
            payer: payer
        });
    }

    function cancel(uint256 callId) external {
        cancelled[callId] = true;
    }

    function getCallState(uint256 callId) external view returns (uint8) {
        return cancelled[callId] ? 3 : 1;
    }

    function getCall(uint256 callId) external view returns (ScheduledCall memory) {
        return _calls[callId];
    }

    function trigger(address target, uint256 executionIndex, uint256 marketId) external {
        (bool ok, bytes memory reason) = target.call(
            abi.encodeWithSignature(
                "onScheduledResolve(uint256,uint256)",
                executionIndex,
                marketId
            )
        );
        if (!ok) {
            assembly {
                revert(add(reason, 32), mload(reason))
            }
        }
    }
}

contract MockRitualWallet {
    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _lockedUntil;

    function deposit(uint256 lockDuration) external payable {
        _balances[msg.sender] += msg.value;
        _lockedUntil[msg.sender] = block.number + lockDuration;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function lockUntil(address account) external view returns (uint256) {
        return _lockedUntil[account];
    }
}

contract MockTEERegistry {
    address public executor;
    bool public found;
    bool public shouldRevert;

    function setResult(address executor_, bool found_) external {
        executor = executor_;
        found = found_;
    }

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function pickServiceByCapability(
        uint8,
        bool,
        uint256,
        uint256
    ) external view returns (address, bool) {
        require(!shouldRevert, "registry unavailable");
        return (executor, found);
    }
}

contract MockHttpPrecompile {
    enum Mode {
        Success,
        Malformed,
        RevertCall
    }

    uint16 public status = 200;
    bytes public body = bytes("{\"price\":4200}");
    string public errorMessage;
    Mode public mode;

    function setResponse(
        uint16 status_,
        bytes calldata body_,
        string calldata errorMessage_
    ) external {
        status = status_;
        body = body_;
        errorMessage = errorMessage_;
        mode = Mode.Success;
    }

    function setMode(Mode mode_) external {
        mode = mode_;
    }

    fallback() external {
        if (mode == Mode.RevertCall) revert("HTTP unavailable");

        bytes memory output;
        if (mode == Mode.Malformed) {
            output = hex"1234";
        } else {
            string[] memory empty = new string[](0);
            bytes memory response = abi.encode(
                status,
                empty,
                empty,
                body,
                errorMessage
            );
            output = abi.encode(bytes(""), response);
        }

        assembly {
            return(add(output, 32), mload(output))
        }
    }
}

contract MockJqPrecompile {
    uint256 public value = 4200;
    bool public shouldFail;

    function setResult(uint256 value_, bool shouldFail_) external {
        value = value_;
        shouldFail = shouldFail_;
    }

    fallback() external {
        if (shouldFail) revert("jq failed");
        bytes memory output = abi.encode(value);
        assembly {
            return(add(output, 32), mload(output))
        }
    }
}
