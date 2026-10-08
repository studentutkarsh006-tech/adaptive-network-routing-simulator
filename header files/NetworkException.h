#ifndef NETWORK_EXCEPTION_H
#define NETWORK_EXCEPTION_H

#include <exception>
#include <string>

using namespace std;

class NetworkException : public exception
{
protected:
    string message;

public:
    NetworkException(const string& message)
    {
        this->message = message;
    }

    const char* what() const noexcept override
    {
        return message.c_str();
    }
};

class RouterNotFoundException : public NetworkException
{
public:
    RouterNotFoundException()
        : NetworkException("Router does not exist.")
    {
    }
};

class LinkNotFoundException : public NetworkException
{
public:
    LinkNotFoundException()
        : NetworkException("Link does not exist.")
    {
    }
};

class DestinationUnreachableException : public NetworkException
{
public:
    DestinationUnreachableException()
        : NetworkException("Destination is unreachable.")
    {
    }
};

#endif